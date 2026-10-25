import { expect, test, type Page } from '@playwright/test';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, open, PHONE, serviceGet, seriousAxeViolations, vnd } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const LANE = 6;
const ME = `me.lane${LANE}@demo.esta.test`;
const TODAY = '2026-10-07';
const SUMMARY = 'Hôm nay cần nhắc tiền thuê Phòng 5 Dãy trọ Dĩ An, hỏi gia hạn Căn hộ Thủ Đức và hoàn cọc Phòng 7 Dãy trọ Dĩ An.';

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const brief = (page: Page) => page.locator('[data-testid="inbox-item"][data-kind="brief"]');

test('before any brief that day, Home says Trợ lý has not written one yet', async ({ page, request }) => {
  await setClock(request, '2026-10-06T08:00:00+07:00');
  await open(page, ME, 'light', PHONE);
  await page.goto('/');
  await expect(page.getByTestId('home-brief-empty')).toHaveText('Trợ lý chưa viết ghi chú hôm nay.');
  await expect(page.getByTestId('home-brief-open')).toHaveAttribute('href', '/assistant');
});

test('at 07:05 Mẹ reads the 07:00 brief first in Hộp thư, opens Phòng 5 from it, and finds its summary on Home', async ({ page, request }) => {
  await setClock(request, `${TODAY}T07:00:00+07:00`);
  worker = await startAgentWorker({ schedule: true });
  await expect
    .poll(async () => (await serviceGet<unknown[]>(page, `agent_jobs?kind=eq.morning_brief&status=eq.done&idempotency_key=eq.morning_brief:${laneHousehold(LANE)}:${TODAY}&select=id`)).length, {
      timeout: 90_000,
    })
    .toBe(1);
  await setClock(request, `${TODAY}T07:05:00+07:00`);

  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');
  await expect(page.getByTestId('worker-ran')).toHaveText('Trợ lý chạy lúc 07:00.');
  await expect(page.getByTestId('inbox-item').first(), 'the brief leads the inbox').toHaveAttribute('data-kind', 'brief');
  await expect(brief(page).getByRole('heading', { level: 3 })).toHaveText(SUMMARY);
  await expect(brief(page).locator('strong')).toHaveText(['Cần làm', 'Theo dõi']);
  const todo = brief(page).getByRole('list').first().getByRole('listitem');
  await expect(todo).toHaveText([
    `Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày, còn nợ ${vnd('2.800.000')}`,
    'Hợp đồng Căn hộ Thủ Đức hết hạn ngày 01/11/2026, còn 25 ngày',
    `Phòng 7 Dãy trọ Dĩ An chưa hoàn tiền cọc ${vnd('2.800.000')}, hợp đồng kết thúc ngày 15/09/2026`,
  ]);
  await expect(brief(page)).not.toContainText('Thị trường');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await todo.first().getByRole('link').click();
  await expect(page).toHaveURL(/\/collections\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('main')).toContainText(vnd('2.800.000'));

  await page.goto('/');
  const home = page.getByTestId('home-brief');
  await expect(home.getByTestId('home-brief-summary')).toHaveText(SUMMARY);
  await expect(home.getByTestId('home-brief-ran')).toHaveText('Trợ lý chạy lúc 07:00.');
  const [today, note] = [await page.getByRole('heading', { name: 'Cần làm hôm nay' }).boundingBox(), await home.boundingBox()];
  expect(note?.y ?? 0, 'the brief sits under Cần làm hôm nay').toBeGreaterThan(today?.y ?? Infinity);
  await home.getByTestId('home-brief-open').click();
  await expect(page).toHaveURL(/\/assistant$/);
});

test('with the worker stopped and the clock 15 minutes on, every page says Trợ lý is offline', async ({ page, request }) => {
  await worker?.stop();
  await setClock(request, `${TODAY}T07:20:00+07:00`);
  await open(page, ME, 'light', DESKTOP);
  for (const path of ['/', '/properties', '/collections', '/assistant']) {
    await page.goto(path);
    await expect(page.getByTestId('worker-status'), path).toHaveText(/^Trợ lý ngoại tuyến từ 07:0\d\. Việc mới sẽ chạy khi máy hoạt động lại\.$/);
  }
  expect(await seriousAxeViolations(page)).toEqual([]);
});
