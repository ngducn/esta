// Usage: ESTA_SLOT=<n> node scripts/connector-integration.ts. Runs apps/connector's *.integration.test.ts against that slot's stack.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const run = spawnSync('pnpm', ['exec', 'vitest', 'run', 'integration'], {
  cwd: join(root, 'apps', 'connector'),
  stdio: 'inherit',
  env: { ...process.env, ESTA_SLOT: String(slot), ESTA_IT_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, ESTA_IT_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
});
process.exit(run.status ?? 1);
