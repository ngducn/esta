import { spawn } from 'node:child_process';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
const webDir = join(repoRoot, 'apps', 'web');
const [command, ...extra] = process.argv.slice(2);
if (command !== 'dev' && command !== 'build' && command !== 'start') {
  console.error('Usage: node scripts/web.ts <dev|build|start> [next flags]');
  process.exit(2);
}

// `build` is the slot-aware build that the browser tests serve (`pnpm e2e`): it bakes the slot's Supabase URL into the
// client bundle and, like `dev`, makes the env file a fresh checkout lacks. `pnpm build` stays as it is for deploys.
if (command === 'dev' || command === 'build') {
  cpSync(join(repoRoot, '.env.example'), join(webDir, '.env.local'), { force: false });
}

const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(repoRoot, slot);
console.error(`ESTA_SLOT=${slot} web=http://localhost:${env.PORT} api=${env.NEXT_PUBLIC_SUPABASE_URL}`);

// Next allows one `next dev` per dist directory, so each slot builds into its own and slots share a checkout.
const distDir = command === 'dev' && slot !== 0 ? { ESTA_NEXT_DIST_DIR: `.next/slot-${slot}` } : {};

// pnpm runs a package script in a process group of its own and forwards no signal to it, so stopping a
// `pnpm --filter` child leaves next-server running. Next runs as the direct child instead.
const nextBin = createRequire(join(webDir, 'package.json')).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, command, ...extra], {
  cwd: webDir,
  stdio: 'inherit',
  env: { ...distDir, ...env },
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
