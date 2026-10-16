import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';

// The worker, the heartbeat table and the test clock are one per slot, so the rules run in order in the `clock` project.
test.describe.configure({ mode: 'serial' });

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false });
const rest = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const cron = { authorization: `Bearer ${env.CRON_SECRET}` };

const pingDir = join(import.meta.dirname, '..', 'fixtures', 'agent-replay', 'ping');
const [recordingFile] = readdirSync(pingDir).filter((name) => name.endsWith('.json'));
const recording = JSON.parse(readFileSync(join(pingDir, recordingFile ?? ''), 'utf8')) as { model: string; numTurns: number };

const ONLINE_0900 = 'Trợ lý đang hoạt động. Cập nhật lúc 09:00.';

let worker: AgentWorker | undefined;

async function setClock(request: APIRequestContext, frozenNow: string) {
  expect((await request.post('/api/test/clock', { headers: cron, data: { frozen_now: frozenNow } })).status()).toBe(200);
}

async function restartWorker(replayDir?: string) {
  await worker?.stop();
  worker = await startAgentWorker(replayDir === undefined ? {} : { replayDir });
}

test.beforeEach(async ({ request }) => {
  await setClock(request, '2026-10-07T09:00:00+07:00');
  await restartWorker();
});

test.afterAll(async ({ request }) => {
  await worker?.stop();
  await request.delete('/api/test/clock', { headers: cron });
});

async function openAssistant(page: Page, email: string, { viewport, theme }: { viewport: [number, number]; theme: 'light' | 'dark' }) {
  await page.setViewportSize({ width: viewport[0], height: viewport[1] });
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
  await page.goto('/assistant');
}

const statusLine = (page: Page) => page.getByTestId('worker-status');

/** The heartbeat lands just after the worker logs its start, so the line is read again until it settles. */
async function expectStatusLine(page: Page, text: string, timeout = 10_000) {
  await expect(async () => {
    await page.reload();
    await expect(statusLine(page)).toHaveText(text, { timeout: 500 });
  }).toPass({ timeout });
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const asUser = (token: string) => ({ apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' });

const runRows = (page: Page) => page.getByTestId('run-row');

async function runCheck(page: Page) {
  const before = await runRows(page).count();
  await page.getByRole('button', { name: /^(Chạy kiểm tra|Run check)$/ }).click();
  return before;
}

test('rule 1: Mẹ sees the online line and no connection check', async ({ page }) => {
  await openAssistant(page, 'me.lane1@demo.esta.test', { viewport: [390, 844], theme: 'light' });
  await expectStatusLine(page, ONLINE_0900);
  await expect(page.getByTestId('connection-check')).toHaveCount(0);
  expect(await page.content()).not.toContain('Kiểm tra kết nối');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: the line goes offline six minutes after the worker stops and online again on restart', async ({ page, request }) => {
  await openAssistant(page, 'me.lane2@demo.esta.test', { viewport: [390, 844], theme: 'dark' });
  await expectStatusLine(page, ONLINE_0900);
  await worker?.stop();
  await setClock(request, '2026-10-07T09:06:00+07:00');
  await page.reload();
  await expect(statusLine(page)).toHaveText('Trợ lý ngoại tuyến từ 09:00. Việc mới sẽ chạy khi máy hoạt động lại.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Each worker process writes its own row, so the restart uses a later minute than the offline check above:
  // a row left by an earlier run's restart then stays in that check's future, which the page does not read.
  await setClock(request, '2026-10-07T09:07:00+07:00');
  await restartWorker();
  await expectStatusLine(page, 'Trợ lý đang hoạt động. Cập nhật lúc 09:07.');
});

test('rule 3: a non-operator gets no diagnostics in the HTML and RLS refuses her ping', async ({ page }) => {
  await openAssistant(page, 'me.lane3@demo.esta.test', { viewport: [1440, 900], theme: 'light' });
  await expectStatusLine(page, ONLINE_0900);
  const html = await (await page.request.get('/assistant')).text();
  for (const diagnostic of ['Kiểm tra kết nối', 'data-testid="connection-check"', 'data-testid="runs-table"', 'Lần chạy gần đây', 'Xác thực', 'mcp__esta__']) {
    expect(html, `the server HTML carries no ${diagnostic}`).not.toContain(diagnostic);
  }

  const token = await accessToken(page);
  const insert = await page.request.post(`${rest}/agent_jobs`, {
    headers: asUser(token),
    data: {
      household_id: seedId('seed:household:lane-3'),
      kind: 'ping',
      run_after: '2026-10-07T02:00:00Z',
      requested_by: seedId('seed:user:me-lane-3'),
    },
  });
  expect(insert.status()).toBe(403);
  expect(((await insert.json()) as { code: string }).code).toBe('42501');

  const runs = await page.request.get(`${rest}/agent_runs?select=id`, { headers: asUser(token) });
  expect(runs.status()).toBe(200);
  expect(await runs.json()).toEqual([]);
});

test('rule 4: Ryan runs the check and the newest run is a replay household_info call', async ({ page }) => {
  await openAssistant(page, 'ryan.lane4@demo.esta.test', { viewport: [1440, 900], theme: 'dark' });
  const before = await runCheck(page);
  await expect(runRows(page)).toHaveCount(Math.min(before + 1, 10), { timeout: 10_000 });
  await expect(page.getByTestId('ping-status')).toHaveText('Xong');
  await expect(page.getByTestId('ping-reply')).toContainText('Gia đình Demo 4');
  await expect(runRows(page).first().locator('td')).toHaveText([
    '07/10/2026 09:00',
    'none',
    'replay',
    recording.model,
    String(recording.numTurns),
    /^0,00\sUS\$$/,
    'mcp__esta__household_info × 1',
  ]);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: a missing recording fails the ping once, with its hash and the record command', async ({ page }) => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'esta-e2e-replay-'));
  try {
    await restartWorker(emptyDir);
    await openAssistant(page, 'ryan.lane5@demo.esta.test', { viewport: [390, 844], theme: 'light' });
    await runCheck(page);
    await expect(page.getByTestId('ping-status')).toHaveText('Lỗi', { timeout: 10_000 });
    await expect(page.getByTestId('ping-error')).toHaveText(/input [0-9a-f]{64} .*pnpm agent:record/);

    const token = await accessToken(page);
    const jobs = await page.request.get(`${rest}/agent_jobs?select=status,attempts&kind=eq.ping&order=created_at.desc&limit=1`, {
      headers: asUser(token),
    });
    expect(await jobs.json()).toEqual([{ status: 'failed', attempts: 1 }]);
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('rule 6: in English at 130% and dark the check still fits a phone', async ({ page }) => {
  await openAssistant(page, 'ryan.lane10@demo.esta.test', { viewport: [390, 844], theme: 'dark' });
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);
  await page.goto('/assistant');
  await expectStatusLine(page, 'Assistant is online. Updated at 09:00.');
  const before = await runCheck(page);
  await expect(runRows(page)).toHaveCount(Math.min(before + 1, 10), { timeout: 10_000 });
  await expect(page.getByTestId('ping-reply')).toContainText('Gia đình Demo 10');
  const fits = await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);
  expect(fits, 'no horizontal page scroll at 390 px').toBe(true);
});

test('two workers on one host keep their own id, heartbeat and config dir', async ({ page }) => {
  await openAssistant(page, 'me.lane6@demo.esta.test', { viewport: [390, 844], theme: 'light' });
  const token = await accessToken(page);
  const heartbeatIds = async () => {
    const response = await page.request.get(`${rest}/worker_heartbeats?select=worker_id`, { headers: asUser(token) });
    return ((await response.json()) as { worker_id: string }[]).map((row) => row.worker_id);
  };
  const home = mkdtempSync(join(tmpdir(), 'esta-e2e-home-'));
  const pair = [await startAgentWorker({ home }), await startAgentWorker({ home })];
  try {
    const ids = pair.map((started) => /^\[agent\] worker (\S+) started/m.exec(started.log())?.[1] ?? '');
    expect(new Set(ids).size, `two distinct worker ids, got ${ids.join(', ')}`).toBe(2);
    for (const id of ids) expect(id).not.toContain(hostname().split('.')[0]);
    expect(readdirSync(home).filter((name) => name.startsWith('config-')).sort()).toEqual(ids.map((id) => `config-${id}`).sort());
    await expect.poll(heartbeatIds).toEqual(expect.arrayContaining(ids));
    await Promise.all(pair.map((started) => started.stop()));
    expect(readdirSync(home).filter((name) => name.startsWith('config-')), 'a stopped worker removes its config dir').toEqual([]);
  } finally {
    await Promise.all(pair.map((started) => started.stop()));
    rmSync(home, { recursive: true, force: true });
  }
});
