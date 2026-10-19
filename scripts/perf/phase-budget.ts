import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { query } from '../db-checksum.ts';
import { parseSlot, slotPorts, slotWorkdir } from '../slot.ts';
import { slotEnv } from '../slot-env.ts';
import { measure, median, sessionCookie, type Medians } from './lighthouse.ts';

type Metric = 'lcpMs' | 'tbtMs' | 'cls' | 'scriptKb';
/**
 * `addedScriptKb` limits the script a route loads beyond the list view's, and `pinsMs` the time until every pinned
 * property shows on the map under Lighthouse's mobile throttling.
 */
export type Budget = { route: string; limits: Partial<Record<Metric, number>>; addedScriptKb?: number; pinsMs?: number; runs?: number };
export type Extras = { listScriptKb?: number; pinsMs?: number };

export const MAP_RUNS = 9;
const GENERAL = { lcpMs: 2500, tbtMs: 200, cls: 0.05, scriptKb: 200 };
const EMAIL = 'me.lane1@demo.esta.test';
const HOUSEHOLD = seedId('seed:household:lane-1');

/**
 * SPEC §7.2 on Properties. The map view is exempt from the script, LCP and TBT lines and has its own budget (operator,
 * 2026-10-17 14:30): what it adds over the list's script, as P1-09 measured it, TBT and every pin within 8 s.
 */
export const PHASE_1_BUDGETS: readonly Budget[] = [
  { route: '/properties', limits: GENERAL },
  // TBT on the map swings between 190 and 860 ms from run to run on one machine, so its median needs more runs than the five the other routes take.
  { route: '/properties?view=map', limits: { tbtMs: 500, cls: GENERAL.cls }, addedScriptKb: 300, pinsMs: 8000, runs: MAP_RUNS },
  { route: `/properties/${seedId('seed:property:lane-1:di-an')}`, limits: GENERAL },
];

/** SPEC §7.2 on the Phase 2 user routes: the documents vault and the add-property wizard's first step. */
export const PHASE_2_BUDGETS: readonly Budget[] = [
  { route: '/documents', limits: GENERAL },
  { route: '/properties/new', limits: GENERAL },
];

const PHASE_BUDGETS: Readonly<Record<string, readonly Budget[]>> = { '1': PHASE_1_BUDGETS, '2': PHASE_2_BUDGETS };

export function misses(budget: Budget, medians: Medians, { listScriptKb, pinsMs }: Extras = {}): string[] {
  const metrics = (Object.keys(budget.limits) as Metric[]).flatMap((key) => {
    const limit = budget.limits[key];
    return limit !== undefined && medians[key] > limit ? [`${key} ${medians[key]} > ${limit}`] : [];
  });
  const added = listScriptKb === undefined ? undefined : medians.scriptKb - listScriptKb;
  const script =
    budget.addedScriptKb !== undefined && (added === undefined || added > budget.addedScriptKb) ? [`addedScriptKb ${added ?? 'unknown'} > ${budget.addedScriptKb}`] : [];
  const pins = budget.pinsMs !== undefined && (pinsMs === undefined || pinsMs > budget.pinsMs) ? [`pinsMs ${pinsMs ?? 'never'} > ${budget.pinsMs}`] : [];
  return [...metrics, ...script, ...pins];
}

/** Lighthouse's mobile throttling: 4x CPU, 150 ms round trip, 1.6 Mbps down and 750 kbps up, cache off. */
async function pinsVisibleMs(origin: string, cookie: string, expected: number): Promise<number | undefined> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setExtraHTTPHeaders({ Cookie: cookie });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${origin}/properties?view=map`, { waitUntil: 'commit' });
    const handle = await page
      .waitForFunction(
        (want) => {
          const groups = [...document.querySelectorAll('[data-testid="pin-group"]')].reduce((sum, group) => sum + Number(group.textContent), 0);
          return document.querySelectorAll('[data-testid="property-pin"]').length + groups >= want ? performance.now() : false;
        },
        expected,
        { polling: 'raf', timeout: 30_000 },
      )
      .catch(() => undefined);
    return handle === undefined ? undefined : Math.round(Number(await handle.jsonValue()));
  } finally {
    await browser.close();
  }
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
  const { values } = parseArgs({ options: { 'skip-build': { type: 'boolean' }, runs: { type: 'string' }, phase: { type: 'string', default: '1' } } });
  const budgets = PHASE_BUDGETS[values.phase];
  if (budgets === undefined) throw new Error(`No budgets for phase ${values.phase}; known: ${Object.keys(PHASE_BUDGETS).join(', ')}`);
  const repoRoot = join(import.meta.dirname, '../..');
  const slot = parseSlot(process.env.ESTA_SLOT);
  const runs = Number(values.runs ?? '5');
  const origin = `http://localhost:${slotPorts(slot).webProd}`;
  const env = { ...slotEnv(repoRoot, slot), ESTA_ENV: 'test', PORT: String(slotPorts(slot).webProd) };
  if (!values['skip-build']) {
    const build = spawnSync('pnpm', ['build'], { cwd: repoRoot, env, stdio: 'inherit' });
    if (build.status !== 0) return 1;
  }
  const server = spawn(process.execPath, [join(repoRoot, 'scripts/web.ts'), 'start'], { cwd: repoRoot, env, stdio: 'inherit' });
  try {
    await waitForServer(`${origin}/sign-in`, 60_000);
    const [pinned] = query<{ count: number }>(
      slotWorkdir(repoRoot, slot),
      `select count(*)::int as count from public.property_list_rows where household_id = '${HOUSEHOLD}' and lat is not null`,
    );
    let failed = 0;
    let listScriptKb: number | undefined;
    for (const budget of budgets) {
      const medians = await measure({ route: budget.route, email: EMAIL, slot, base: origin, runs: budget.runs ?? runs, label: `phase-${values.phase}` });
      let pinsMs: number | undefined;
      if (budget.pinsMs !== undefined) {
        const cookie = await sessionCookie(origin, EMAIL, slot);
        const times: number[] = [];
        for (let index = 0; index < runs; index++) times.push((await pinsVisibleMs(origin, cookie, pinned?.count ?? 0)) ?? Number.POSITIVE_INFINITY);
        pinsMs = median(times);
      }
      if (budget.route === '/properties') listScriptKb = medians.scriptKb;
      const missed = misses(budget, medians, { ...(listScriptKb === undefined ? {} : { listScriptKb }), ...(pinsMs === undefined ? {} : { pinsMs }) });
      const shown = {
        ...medians,
        ...(budget.addedScriptKb === undefined || listScriptKb === undefined ? {} : { addedScriptKb: medians.scriptKb - listScriptKb }),
        ...(pinsMs === undefined ? {} : { pinsMs, pins: pinned?.count }),
      };
      console.log(`${missed.length === 0 ? 'PASS' : 'FAIL'}  ${budget.route}  ${JSON.stringify(shown)}${missed.length === 0 ? '' : `  ${missed.join(', ')}`}`);
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
