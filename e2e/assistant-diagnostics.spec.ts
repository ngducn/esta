import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { readReportTable } from './helpers/report-table';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, serviceGet, seriousAxeViolations, shot } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const LANE = 6;
const RYAN = `ryan.lane${LANE}@demo.esta.test`;
const GUARD_CASE = join(import.meta.dirname, '..', 'fixtures', 'agent-replay-cases', 'guard-violation');
const NOW = '2026-10-07T06:45:00+07:00';

let worker: AgentWorker | undefined;

test.beforeAll(async ({ request }) => {
  await setClock(request, NOW);
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const jobsEnded = async (page: Page, kind: string, status: string) =>
  (await serviceGet<unknown[]>(page, `agent_jobs?household_id=eq.${laneHousehold(LANE)}&kind=eq.${kind}&status=eq.${status}&select=id`)).length;

async function openMenu(page: Page) {
  await page.getByRole('button', { name: /^(Tài khoản|Account)/ }).click();
  await expect(page.locator('#account-menu'), 'the menu has finished sliding in').toHaveCSS('opacity', '1');
}

test('Ryan opens diagnostics from his menu and reads the replay worker, the last runs, the held note and 7-day usage by kind', async ({ page }) => {
  worker = await startAgentWorker();
  await open(page, RYAN, 'light', DESKTOP);
  await page.goto('/assistant');
  const pings = await jobsEnded(page, 'ping', 'done');
  await page.getByRole('button', { name: 'Chạy kiểm tra' }).click();
  await expect.poll(() => jobsEnded(page, 'ping', 'done'), { timeout: 15_000 }).toBe(pings + 1);

  await worker.stop();
  worker = await startAgentWorker({ replayDir: GUARD_CASE });
  await page.reload();
  const watches = await jobsEnded(page, 'portfolio_watch', 'failed');
  await page.getByRole('button', { name: 'Chạy theo dõi' }).click();
  await expect.poll(() => jobsEnded(page, 'portfolio_watch', 'failed'), { timeout: 30_000 }).toBe(watches + 1);

  await openMenu(page);
  await page.getByRole('link', { name: 'Chẩn đoán Trợ lý' }).click();
  await expect(page).toHaveURL(/\/assistant\/diagnostics$/);
  await expect(page.locator('#account-menu'), 'the menu has faded out after the link').toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chẩn đoán Trợ lý');
  await expect(page.getByTestId('worker-status')).toHaveText('Trợ lý đang hoạt động. Cập nhật lúc 06:45.');
  await expect(page.getByTestId('diagnostics-agent-mode')).toHaveText('replay');
  await expect(page.getByTestId('diagnostics-auth-mode')).toHaveText('none');

  const runs = await readReportTable(page.getByTestId('diagnostics-runs'));
  expect(runs.columns).toEqual(['Thời gian', 'Loại việc', 'Kết quả', 'Lượt', 'Thời lượng', 'Mô hình', 'Chi phí ước tính', 'Công cụ đã gọi']);
  expect(runs.rows.length).toBeLessThanOrEqual(20);
  expect(runs.rows.slice(0, 2).map(({ cells }) => [cells['#0'], cells.kind, cells.status])).toEqual([
    ['07/10/2026 06:45', 'portfolio_watch', 'Lỗi'],
    ['07/10/2026 06:45', 'ping', 'Xong'],
  ]);
  for (const { cells } of runs.rows) expect(cells.duration, 'every finished run has its duration').toMatch(/^(\d+ phút )?\d+ giây$/);
  expect(runs.totals.cells['#0']).toBe(`${runs.rows.length} lần chạy`);

  await expect(page.getByTestId('diagnostics-held-note').first()).toHaveText('07/10/2026 06:45 · portfolio_watch');

  const usage = await readReportTable(page.getByTestId('diagnostics-usage'));
  expect(usage.columns).toEqual(['Loại việc', 'Lần chạy', 'Lượt', 'Token vào', 'Token ra', 'Chi phí ước tính']);
  expect(usage.rows.map((row) => row.key)).toEqual(expect.arrayContaining(['ping', 'portfolio_watch']));
  const count = (text: string | undefined) => Number((text ?? '').replace(/\D/g, ''));
  expect(count(usage.totals.cells.runs), 'the total counts every kind').toBe(usage.rows.reduce((sum, row) => sum + count(row.cells.runs), 0));
  expect(usage.totals.cells['#0']).toBe('Tổng');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-diagnostics-1440x900-light');

  await page.setViewportSize(PHONE);
  expect(await noSidewaysScroll(page), 'no sideways scroll at 390 px').toBe(true);
  await shot(page, 'p5-08-diagnostics-390x844-light');
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-diagnostics-390x844-dark');
});

test('Mẹ’s menu has no diagnostics entry, its link shows a plain not-found page, and the worker modes answer her nothing', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto('/assistant');
  await openMenu(page);
  await expect(page.locator('#account-menu').getByRole('link')).not.toHaveCount(0);
  await expect(page.locator('#account-menu').getByRole('link', { name: 'Chẩn đoán Trợ lý' })).toHaveCount(0);
  await shot(page, 'p5-08-diagnostics-hidden-menu-390x844-light');

  const response = await page.goto('/assistant/diagnostics');
  expect(response?.status(), 'a non-operator gets a real 404').toBe(404);
  await expect(page.getByTestId('page-not-found')).toContainText('Không tìm thấy trang này');
  const html = (await response?.text()) ?? '';
  expect(html).toContain('noindex');
  for (const diagnostic of ['diagnostics-runs', 'diagnostics-auth-mode', 'Chẩn đoán Trợ lý', 'Lần chạy gần đây', 'Xác thực']) {
    expect(html, `the server HTML carries no ${diagnostic}`).not.toContain(diagnostic);
  }
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-diagnostics-hidden-390x844-light');

  const modes = await memberRest<unknown[]>(page, 'POST', 'rpc/worker_modes', { p_household_id: laneHousehold(7), p_seen_by: '2026-10-07T00:00:00Z' });
  expect(modes, 'the worker modes answer a non-operator nothing').toEqual([]);
});

test('in English at 130% and dark, the diagnostics tables stack on a phone with no sideways scroll', async ({ page }) => {
  await open(page, RYAN, 'dark', PHONE);
  await inEnglishAt130(page, seedId(`seed:member:ryan-lane-${LANE}`), async () => {
    expect((await page.goto('/assistant/diagnostics'))?.status(), 'the operator opens it').toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Assistant diagnostics');
    const firstRun = page.getByTestId('diagnostics-runs').getByTestId('report-row').first();
    await expect(firstRun).toHaveCSS('display', 'block');
    await expect(firstRun.locator('[data-column="status"]')).toContainText('Failed');
    await shot(page, 'p5-08-diagnostics-english-390x844-dark');
    expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});
