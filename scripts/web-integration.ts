// Usage: ESTA_SLOT=<n> node scripts/web-integration.ts [file...]. Runs apps/web's *.integration.test.ts, or the files named
// relative to apps/web, against that slot's stack.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { runsAlone } from '../apps/web/src/test/lanes.ts';
import { parseSlot, slotPorts } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const AS_OF_INSTANT = '2026-10-07T09:00:00+07:00';
const clock = (target: string) => spawnSync('pnpm', ['clock:set', target], { cwd: root, stdio: 'inherit', env: { ...process.env, ESTA_SLOT: String(slot) } });
if (clock(AS_OF_INSTANT).status !== 0) process.exit(1);
const vitest = (...filters: string[]) =>
  spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'node', ...filters], {
    cwd: join(root, 'apps', 'web'),
    stdio: 'inherit',
    env: {
      ...process.env,
      ESTA_SLOT: String(slot),
      ESTA_IT_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      ESTA_IT_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ESTA_IT_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      ESTA_IT_MAILBOX: `http://127.0.0.1:${slotPorts(slot).inbucket}/api/v1`,
    },
  }).status ?? 1;
const files = process.argv.slice(2);
const status =
  files.length > 0
    ? vitest(...files)
    : vitest('integration', ...runsAlone.flatMap((file) => ['--exclude', file])) || (runsAlone.length > 0 ? vitest(...runsAlone) : 0);
clock('off');
process.exit(status);
