import { spawn } from 'node:child_process';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
const webDir = join(repoRoot, 'apps', 'web');
const [command, ...extra] = process.argv.slice(2);
if (command !== 'dev' && command !== 'start') {
  console.error('Usage: node scripts/web.ts <dev|start> [next flags]');
  process.exit(2);
}

if (command === 'dev') {
  cpSync(join(repoRoot, '.env.example'), join(webDir, '.env.local'), { force: false });
}

const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(repoRoot, slot);
console.error(`ESTA_SLOT=${slot} web=http://localhost:${env.PORT} api=${env.NEXT_PUBLIC_SUPABASE_URL}`);

// pnpm runs a package script in a process group of its own and forwards no signal to it, so stopping a
// `pnpm --filter` child leaves next-server running. Next runs as the direct child instead.
const nextBin = createRequire(join(webDir, 'package.json')).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, command, ...extra], { cwd: webDir, stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
