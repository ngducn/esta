import { spawn } from 'node:child_process';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
const [command, ...extra] = process.argv.slice(2);
if (command !== 'dev' && command !== 'start') {
  console.error('Usage: node scripts/web.ts <dev|start> [next flags]');
  process.exit(2);
}

if (command === 'dev') {
  cpSync(join(repoRoot, '.env.example'), join(repoRoot, 'apps', 'web', '.env.local'), { force: false });
}

const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(repoRoot, slot);
console.error(`ESTA_SLOT=${slot} web=http://localhost:${env.PORT} api=${env.NEXT_PUBLIC_SUPABASE_URL}`);

const child = spawn('pnpm', ['--filter', '@esta/web', command, ...extra], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
