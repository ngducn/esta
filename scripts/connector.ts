// Usage: ESTA_SLOT=<n> node --import tsx scripts/connector.ts [login]. Points the connector at that slot's local
// Supabase with the anon key alone; the service role key in the status output is never passed on.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { parseSlot, slotPorts, slotWorkdir } from './slot.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const status = spawnSync('supabase', ['status', '-o', 'env', '--workdir', slotWorkdir(root, slot)], { encoding: 'utf8' });
const anonKey = status.status === 0 ? parseEnv(status.stdout).ANON_KEY : undefined;
if (anonKey === undefined) {
  console.error(`ESTA_SLOT=${slot}: local Supabase is not running; start it with ESTA_SLOT=${slot} pnpm db:start`);
  process.exit(1);
}
process.env.ESTA_SUPABASE_URL = `http://127.0.0.1:${slotPorts(slot).api}`;
process.env.ESTA_SUPABASE_ANON_KEY = anonKey;
await import(process.argv[2] === 'login' ? '../apps/connector/src/cli-login.ts' : '../apps/connector/src/main.ts');
