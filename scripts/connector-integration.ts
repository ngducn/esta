// Usage: ESTA_SLOT=<n> node scripts/connector-integration.ts. Runs apps/connector's *.integration.test.ts against that
// slot's stack with its database clock at AS_OF_INSTANT, where the seed's dates hold, and clears the clock after.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const clock = (target: string) => spawnSync('pnpm', ['clock:set', target], { cwd: root, stdio: 'inherit', env: { ...process.env, ESTA_SLOT: String(slot) } }).status;
if (clock('2026-10-07T09:00:00+07:00') !== 0) process.exit(1);
// One file at a time: a file that moves the database clock would expire another file's plans.
const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--no-file-parallelism', 'integration'], {
  cwd: join(root, 'apps', 'connector'),
  stdio: 'inherit',
  env: { ...process.env, ESTA_SLOT: String(slot), ESTA_IT_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, ESTA_IT_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
});
clock('off');
process.exit(run.status ?? 1);
