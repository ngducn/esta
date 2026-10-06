import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { renderCaddyfile } from './caddyfile.ts';
import { devCaDir, trustInstructions } from './dev-ca.ts';
import { commandOf, liveState, type State } from './dev-lan-state.ts';
import { lanAddress } from './lan-address.ts';
import { parseSlot, slotPorts } from './slot.ts';

const READY_TIMEOUT_MS = 60_000;
const PARENT_POLL_MS = 1_000;

const repoRoot = join(import.meta.dirname, '..');
const certsDir = join(repoRoot, '.certs');
const caRoot = devCaDir(process.env, homedir());
const caFile = join(caRoot, 'rootCA.pem');
const publicDir = join(certsDir, 'public');
const slot = parseSlot(process.env.ESTA_SLOT);
const ports = slotPorts(slot);
const runDir = join(repoRoot, '.dev-lan', `slot-${slot}`);
const stateFile = join(runDir, 'state.json');

function requireTools(): void {
  for (const tool of ['mkcert', 'caddy']) {
    if (spawnSync('which', [tool], { stdio: 'ignore' }).status === 0) continue;
    console.error(
      [
        `pnpm dev:lan needs ${tool}, which is not on PATH.`,
        `Install it with \`brew install ${tool}\`.`,
        `Then trust the dev CA once on this Mac with \`CAROOT="${caRoot}" mkcert -install\`.`,
      ].join('\n'),
    );
    process.exit(1);
  }
}

function ensureCertificates(lan: string): { certFile: string; keyFile: string } {
  const certFile = join(certsDir, `lan-${lan}.pem`);
  const keyFile = join(certsDir, `lan-${lan}-key.pem`);
  const reusable =
    existsSync(certFile) &&
    existsSync(keyFile) &&
    existsSync(caFile) &&
    new X509Certificate(readFileSync(certFile)).verify(new X509Certificate(readFileSync(caFile)).publicKey);
  if (!reusable) {
    mkdirSync(caRoot, { recursive: true, mode: 0o700 });
    const result = spawnSync('mkcert', ['-cert-file', certFile, '-key-file', keyFile, lan, 'localhost', '127.0.0.1'], {
      env: { ...process.env, CAROOT: caRoot },
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error(result.stderr);
      process.exit(1);
    }
  }
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(caFile, join(publicDir, 'esta-dev-ca.crt'));
  return { certFile, keyFile };
}

function printUrls(lan: string): void {
  const web = `https://${lan}:${ports.webLan}`;
  const fingerprint = new X509Certificate(readFileSync(caFile)).fingerprint256;
  console.log(
    [
      '',
      `Esta LAN: ${web}`,
      `Supabase API: https://${lan}:${ports.apiLan}`,
      `Inbucket: https://${lan}:${ports.inbucketLan}`,
      '',
      trustInstructions({ web, caDir: caRoot, fingerprint }),
      '',
    ].join('\n'),
  );
}

function listening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitUntilListening(targets: readonly [string, number][]): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const up = await Promise.all(targets.map(([host, port]) => listening(host, port)));
    if (up.every(Boolean)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

requireTools();
const running = liveState(existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : undefined, commandOf);
if (running !== undefined) {
  console.log(`pnpm dev:lan is already running for ESTA_SLOT=${slot} (pid ${running.pid}).`);
  printUrls(running.lan);
  process.exit(0);
}

const lan = lanAddress(networkInterfaces());
const { certFile, keyFile } = ensureCertificates(lan);
mkdirSync(runDir, { recursive: true });
const caddyfile = join(runDir, 'Caddyfile');
const caddyLog = join(runDir, 'caddy.log');
const template = readFileSync(join(repoRoot, 'infra', 'caddy', 'Caddyfile.template'), 'utf8');
writeFileSync(caddyfile, renderCaddyfile(template, { lan, slot, certFile, keyFile, publicDir }));

const logFd = openSync(caddyLog, 'w');
const children: ChildProcess[] = [
  spawn('caddy', ['run', '--adapter', 'caddyfile', '--config', caddyfile], {
    stdio: ['ignore', logFd, logFd],
    detached: true,
    env: { ...process.env, XDG_DATA_HOME: join(runDir, 'caddy-data'), XDG_CONFIG_HOME: join(runDir, 'caddy-config') },
  }),
  spawn(process.execPath, [join(repoRoot, 'scripts', 'web.ts'), 'dev', '--hostname', '127.0.0.1'], {
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `https://${lan}:${ports.apiLan}`,
      ESTA_LAN_HOST: lan,
      NODE_EXTRA_CA_CERTS: caFile,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }),
];
writeFileSync(stateFile, JSON.stringify({ pid: process.pid, lan } satisfies State));

// pnpm does not forward SIGTERM to next, so each child leads its own process group and the whole group is stopped.
function shutdown(code: number): never {
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  rmSync(stateFile, { force: true });
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => shutdown(0));
const parent = process.ppid;
setInterval(() => {
  if (process.ppid !== parent) shutdown(0);
}, PARENT_POLL_MS).unref();
for (const [index, child] of children.entries()) {
  child.on('exit', (code) => {
    if (index === 0) console.error(`Caddy stopped with code ${code}. Its log is ${caddyLog}.`);
    shutdown(code ?? 1);
  });
}

const ready = await waitUntilListening([
  ['127.0.0.1', ports.web],
  [lan, ports.webLan],
  [lan, ports.apiLan],
  [lan, ports.inbucketLan],
]);
if (!ready) {
  console.error(`pnpm dev:lan did not come up within ${READY_TIMEOUT_MS / 1000} s. Caddy's log is ${caddyLog}.`);
  shutdown(1);
}
printUrls(lan);
