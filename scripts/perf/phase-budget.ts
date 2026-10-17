import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { parseSlot, slotPorts } from '../slot.ts';
import { slotEnv } from '../slot-env.ts';
import { measure, type Medians } from './lighthouse.ts';

export type Budget = { route: string; lcpMs: number; tbtMs: number; cls: number; scriptKb: number };

const GENERAL = { lcpMs: 2500, tbtMs: 200, cls: 0.05, scriptKb: 200 };

/** SPEC §7.2 on Properties, with the 2026-10-17 map exception (TBT 500 ms, map script 300 KB). */
export const PHASE_1_BUDGETS: readonly Budget[] = [
  { route: '/properties', ...GENERAL },
  { route: '/properties?view=map', ...GENERAL, tbtMs: 500, scriptKb: 300 },
  { route: `/properties/${seedId('seed:property:lane-1:di-an')}`, ...GENERAL },
];

export function misses(budget: Budget, medians: Medians): string[] {
  return (['lcpMs', 'tbtMs', 'cls', 'scriptKb'] as const).filter((key) => medians[key] > budget[key]).map((key) => `${key} ${medians[key]} > ${budget[key]}`);
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetch(url, { redirect: 'manual' }).then(() => true, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not answer within ${timeoutMs / 1000} s`);
}

async function run(): Promise<number> {
  const { values } = parseArgs({ options: { 'skip-build': { type: 'boolean' }, runs: { type: 'string' } } });
  const repoRoot = join(import.meta.dirname, '../..');
  const slot = parseSlot(process.env.ESTA_SLOT);
  const port = slotPorts(slot).webProd;
  const env = { ...slotEnv(repoRoot, slot), ESTA_ENV: 'test', PORT: String(port) };
  if (!values['skip-build']) {
    const build = spawnSync('pnpm', ['build'], { cwd: repoRoot, env, stdio: 'inherit' });
    if (build.status !== 0) return 1;
  }
  const server = spawn(process.execPath, [join(repoRoot, 'scripts/web.ts'), 'start'], { cwd: repoRoot, env, stdio: 'inherit' });
  try {
    await waitForServer(`http://localhost:${port}/`, 60_000);
    let failed = 0;
    for (const budget of PHASE_1_BUDGETS) {
      const medians = await measure({ route: budget.route, email: 'me.lane1@demo.esta.test', slot, runs: Number(values.runs ?? '5'), label: 'phase-1' });
      const missed = misses(budget, medians);
      console.log(`${missed.length === 0 ? 'PASS' : 'FAIL'}  ${JSON.stringify(medians)}${missed.length === 0 ? '' : `  ${missed.join(', ')}`}`);
      if (missed.length > 0) failed++;
    }
    return failed === 0 ? 0 : 1;
  } finally {
    server.kill('SIGTERM');
  }
}

if (import.meta.main) {
  run().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
