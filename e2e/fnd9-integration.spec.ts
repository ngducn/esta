import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot, slotPorts } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';

// FND-9: one test clock, one web server and one worker per slot, moved a day without restarting either.
test.describe.configure({ mode: 'serial' });

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false });
const cron = { authorization: `Bearer ${env.CRON_SECRET}` };
const rest = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const webPort = Number(process.env.PORT ?? slotPorts(parseSlot(process.env.ESTA_SLOT)).web);

const OCT_7 = '2026-10-07T09:00:00+07:00';
const OCT_8 = '2026-10-08T09:00:00+07:00';

let worker: AgentWorker;
let workerPid: number;
let webPid: string;

/** The process listening on the web port, so a restarted server shows up as a new pid. */
function listeningPid(): string {
  if (process.platform === 'linux') {
    // lsof cannot see next-server's listening socket on the GitHub runner, so read the pid from ss.
    const sockets = execFileSync('ss', ['-ltnpH', `sport = :${webPort}`], { encoding: 'utf8' });
    return /pid=(\d+)/.exec(sockets)?.[1] ?? '';
  }
  return execFileSync('lsof', ['-nP', '-t', `-iTCP:${webPort}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
}

async function setClock(request: APIRequestContext, frozenNow: string) {
  expect((await request.post('/api/test/clock', { headers: cron, data: { frozen_now: frozenNow } })).status()).toBe(200);
}

function expectNoRestart() {
  expect(listeningPid(), 'the web server kept its pid').toBe(webPid);
  expect(worker.running(), 'the worker is still running').toBe(true);
  expect(worker.pid, 'the worker kept its pid').toBe(workerPid);
  expect(worker.log().match(/\[agent\] worker \S+ started/g), 'the worker started once').toHaveLength(1);
}

async function open(page: Page, email: string, path: string, { viewport, theme }: { viewport: [number, number]; theme: 'light' | 'dark' }) {
  await page.setViewportSize({ width: viewport[0], height: viewport[1] });
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
  await page.goto(path);
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  await expect(page).not.toHaveTitle('');
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const dateLine = (page: Page) => page.getByTestId('date-line');
const fitsWidth = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);

test.beforeAll(async ({ request }) => {
  await setClock(request, OCT_7);
  webPid = listeningPid();
  expect(webPid, 'one process listens on the web port').toMatch(/^\d+$/);
  worker = await startAgentWorker();
  workerPid = worker.pid;
});

test.beforeEach(async ({ request }) => {
  await setClock(request, OCT_7);
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await request.delete('/api/test/clock', { headers: cron });
});

// Runs first, so on a fresh seed the 08/10 heartbeat it waits for is the worker's next beat, not one from an earlier rule.
test('rule 4: after the advance the worker reports online at 09:00 on its next heartbeat', async ({ page, request }) => {
  test.setTimeout(120_000);
  await setClock(request, OCT_8);
  await open(page, 'me.lane4@demo.esta.test', '/assistant', { viewport: [1440, 900], theme: 'light' });
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('worker-status')).toHaveText('Trợ lý đang hoạt động. Cập nhật lúc 09:00.', { timeout: 1_000 });
  }).toPass({ timeout: 70_000 });
  await expect(dateLine(page)).toHaveText('Thứ Năm, 08/10/2026');
  expectNoRestart();
});

test('rule 1: the Home header moves from Wednesday to Thursday on reload', async ({ page, request }) => {
  await open(page, 'me.lane1@demo.esta.test', '/', { viewport: [390, 844], theme: 'light' });
  await expect(dateLine(page)).toHaveText('Thứ Tư, 07/10/2026');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await setClock(request, OCT_8);
  await page.reload();
  await expect(dateLine(page)).toHaveText('Thứ Năm, 08/10/2026');
  expect(await seriousAxeViolations(page)).toEqual([]);
  expectNoRestart();
});

test('rule 2: the keep-alive cron route reads the business date of each clock', async ({ page, request }) => {
  await open(page, 'ryan.lane2@demo.esta.test', '/', { viewport: [1440, 900], theme: 'dark' });
  const keepAlive = async () => {
    const response = await request.get('/api/cron/keep-alive', { headers: cron });
    expect(response.status()).toBe(200);
    return response.json() as Promise<{ ok: boolean; as_of: string }>;
  };
  expect(await keepAlive()).toEqual({ ok: true, as_of: '2026-10-07' });

  await setClock(request, OCT_8);
  expect(await keepAlive()).toEqual({ ok: true, as_of: '2026-10-08' });
  expectNoRestart();
});

test('rule 3: a ping on each day runs in the same worker and lands on that business date', async ({ page, request }) => {
  test.setTimeout(60_000);
  await open(page, 'ryan.lane3@demo.esta.test', '/assistant/diagnostics', { viewport: [390, 844], theme: 'dark' });
  const ping = async () => {
    // Reloading before the action answers shows the previous check's Xong, and the job then starts on the next clock.
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && response.url() === page.url()),
      page.getByRole('button', { name: 'Chạy kiểm tra' }).click(),
    ]);
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('ping-status')).toHaveText('Xong', { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  };

  const runTimes = async () => {
    await page.reload();
    return page.getByTestId('diagnostics-runs').getByTestId('report-row').locator('th').allTextContents();
  };

  await ping();
  expect((await runTimes())[0]).toMatch(/^0[78]\/10\/2026 09:00$/);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await setClock(request, OCT_8);
  await page.reload();
  await ping();
  const times = await runTimes();
  expect(times[0], 'the newest run started on the advanced clock').toBe('08/10/2026 09:00');
  expect(times, 'the run before it started on the first clock').toContain('07/10/2026 09:00');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const token = await accessToken(page);
  const newest = await request.get(`${rest}/agent_runs?select=started_at&order=created_at.desc&limit=2`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', authorization: `Bearer ${token}` },
  });
  expect(await newest.json(), 'the two runs this rule queued, newest first').toEqual([
    { started_at: '2026-10-08T02:00:00+00:00' },
    { started_at: '2026-10-07T02:00:00+00:00' },
  ]);
  expectNoRestart();
});

test('rule 5: in English at 130% and dark the header advances and the page still fits a phone', async ({ page, request }) => {
  await open(page, 'me.lane10@demo.esta.test', '/settings', { viewport: [390, 844], theme: 'dark' });
  // A rerun finds the member already in English, so each name matches either language.
  for (const choice of [/^English/, /^130%/, /^(Tối|Dark)/]) await page.getByRole('radio', { name: choice }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);
  await page.goto('/');
  await expect(dateLine(page)).toHaveText('Wednesday, 07/10/2026');
  expect(await fitsWidth(page), 'no sideways scroll on 07/10').toBe(true);

  await setClock(request, OCT_8);
  await page.reload();
  await expect(dateLine(page)).toHaveText('Thursday, 08/10/2026');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await fitsWidth(page), 'no sideways scroll on 08/10').toBe(true);
  expectNoRestart();
});
