import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindingWarning, exposedListeners, listListeners } from './bindings.ts';
import { authDrifts, parseSlot, slotPorts, writeSlotWorkdir } from './slot.ts';
import { reportTableCoverage } from './table-coverage.ts';

const COMMANDS: Record<string, string[]> = {
  start: ['start'],
  stop: ['stop'],
  status: ['status'],
  reset: ['db', 'reset'],
  test: ['test', 'db'],
  types: ['gen', 'types', 'typescript', '--local'],
};

const SEED_FLAGS = new Set(['--households', '--as-of', '--variant']);

function splitSeedFlags(args: readonly string[]): { seed: string[]; rest: string[] } {
  const seed: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (!SEED_FLAGS.has(arg.split('=')[0] ?? '')) rest.push(arg);
    else if (arg.includes('=')) seed.push(arg);
    else seed.push(arg, args[++i] ?? '');
  }
  return { seed, rest };
}

const repoRoot = join(import.meta.dirname, '..');
const [command, ...flags] = process.argv.slice(2);
const args = command === undefined ? undefined : COMMANDS[command];
if (args === undefined) {
  console.error(`Usage: node scripts/db.ts <${Object.keys(COMMANDS).join('|')}> [seed flags] [supabase flags]`);
  process.exit(2);
}
const { seed: seedFlags, rest: extra } = splitSeedFlags(flags);
// `start` seeds a fresh database too.
const seeds = command === 'reset' || command === 'start';
if (!seeds && seedFlags.length > 0) {
  console.error(`${[...SEED_FLAGS].join(', ')} apply only to reset and start`);
  process.exit(2);
}

const slot = parseSlot(process.env.ESTA_SLOT);
const lan = command === 'start' ? process.env.ESTA_LAN_HOST || undefined : undefined;
const workdir = writeSlotWorkdir(repoRoot, slot, lan);
console.error(`ESTA_SLOT=${slot} workdir=${workdir}`);
const supabaseEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' };

function runningAuthEnv(): string[] | undefined {
  const inspect = spawnSync('docker', ['inspect', '--format', '{{json .Config.Env}}', `supabase_auth_esta-${slot}`], {
    encoding: 'utf8',
  });
  return inspect.status === 0 ? (JSON.parse(inspect.stdout) as string[]) : undefined;
}

if (command === 'start') {
  const running = runningAuthEnv();
  const slotToml = readFileSync(join(workdir, 'supabase', 'config.toml'), 'utf8');
  if (running !== undefined && authDrifts(slotToml, running)) {
    console.error(`ESTA_SLOT=${slot}: auth runs with ${lan === undefined ? 'LAN' : 'localhost'} URLs, restarting the stack to switch`);
    const stop = spawnSync('supabase', ['stop', '--workdir', workdir], { stdio: 'inherit', env: supabaseEnv });
    if (stop.status !== 0) process.exit(stop.status ?? 1);
  }
}

if (seeds) {
  const seedPath = /^sql_paths = \["\.\/([^"]+)"\]$/m.exec(readFileSync(join(repoRoot, 'supabase', 'config.toml'), 'utf8'))?.[1];
  if (seedPath === undefined) throw new Error('supabase/config.toml must name exactly one [db.seed] sql_paths file');
  const out = join(workdir, 'supabase', seedPath);
  const generator = spawnSync(
    join(repoRoot, 'node_modules', '.bin', 'tsx'),
    [join(repoRoot, 'supabase', 'seed', 'generator', 'index.ts'), ...seedFlags, '--out', out],
    { stdio: 'inherit' },
  );
  if (generator.error) throw generator.error;
  if (generator.status !== 0) process.exit(generator.status ?? 1);
}

const capture = command === 'types';
const result = spawnSync('supabase', [...args, '--workdir', workdir, ...extra], {
  stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
  encoding: 'utf8',
  env: supabaseEnv,
});
if (result.error) throw result.error;
if (result.status === 0 && command === 'start') {
  const warning = bindingWarning(exposedListeners(listListeners(), slotPorts(slot)), slot);
  if (warning !== undefined) console.error(`\n${warning}\n`);
}
if (result.status === 0 && capture) {
  writeFileSync(join(repoRoot, 'packages', 'db', 'src', 'database.types.ts'), result.stdout);
}
if (result.status === 0 && command === 'test' && !reportTableCoverage(repoRoot, slot)) process.exit(1);
process.exit(result.status ?? 1);
