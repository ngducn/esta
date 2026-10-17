import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { devCaDir } from '../dev-ca.ts';
import { ensureCertificates } from '../dev-certs.ts';
import { slotPorts } from '../slot.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
const READY_TIMEOUT_MS = 10_000;

export type H2Proxy = { origin: string; spkiHash: string; stop: () => void };

export function proxyPort(slot: number): number {
  return slotPorts(slot).webProd + 1000;
}

export function renderPerfCaddyfile({ port, upstream, certFile, keyFile }: { port: number; upstream: string; certFile: string; keyFile: string }): string {
  return `{
	admin off
	auto_https off
	skip_install_trust
	ocsp_stapling off
}

https://localhost:${port} {
	bind 127.0.0.1
	tls "${certFile}" "${keyFile}"
	reverse_proxy ${upstream}
}
`;
}

export function spkiHashOf(certPem: string): string {
  const der = new X509Certificate(certPem).publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64');
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// The dev CA is never installed. Lighthouse's Chrome is told to accept this one leaf certificate by its public key hash.
export async function startH2Proxy({ slot, upstream }: { slot: number; upstream: string }): Promise<H2Proxy> {
  for (const tool of ['mkcert', 'caddy']) {
    if (spawnSync('which', [tool], { stdio: 'ignore' }).status !== 0) {
      throw new Error(`HTTP/2 measurement needs ${tool} on PATH (brew install ${tool}). Pass --http1 to measure without the proxy.`);
    }
  }
  const caRoot = devCaDir(process.env, homedir());
  const { certFile, keyFile } = ensureCertificates({ lan: 'localhost', certsDir: join(repoRoot, '.certs'), caRoot });
  const port = proxyPort(slot);
  const origin = `https://localhost:${port}`;
  const spkiHash = spkiHashOf(readFileSync(certFile, 'utf8'));
  if (await listening(port)) return { origin, spkiHash, stop: () => undefined };
  const runDir = join(repoRoot, '.dev-lan', `slot-${slot}`);
  mkdirSync(runDir, { recursive: true });
  const caddyfile = join(runDir, 'perf-Caddyfile');
  writeFileSync(caddyfile, renderPerfCaddyfile({ port, upstream, certFile, keyFile }));
  const child: ChildProcess = spawn('caddy', ['run', '--adapter', 'caddyfile', '--config', caddyfile], {
    stdio: 'ignore',
    env: { ...process.env, XDG_DATA_HOME: join(runDir, 'caddy-data'), XDG_CONFIG_HOME: join(runDir, 'caddy-config') },
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await listening(port))) {
    if (Date.now() > deadline || child.exitCode !== null) {
      child.kill();
      throw new Error(`The HTTP/2 proxy did not come up on port ${port}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { origin, spkiHash, stop: () => void child.kill('SIGTERM') };
}
