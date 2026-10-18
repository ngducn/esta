// Usage: ESTA_SLOT=<n> node scripts/web-integration.ts. Runs apps/web's *.integration.test.ts against that slot's stack.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot, slotPorts } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'node', 'integration'], {
  cwd: join(root, 'apps', 'web'),
  stdio: 'inherit',
  env: {
    ...process.env,
    ESTA_SLOT: String(slot),
    ESTA_IT_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    ESTA_IT_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ESTA_IT_MAILBOX: `http://127.0.0.1:${slotPorts(slot).inbucket}/api/v1`,
  },
});
process.exit(result.status ?? 1);
