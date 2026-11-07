import { expect, test, type Page } from '@playwright/test';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { laneHousehold } from './helpers/seed';
import { setClock, globalClock, lanes } from './helpers/test-clock';
import { DESKTOP, open, PHONE, serviceGet, seriousAxeViolations, vnd } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const LANE = 6;
const ME = `me.lane${LANE}@demo.esta.test`;
const TODAY = '2026-10-07';
const SUMMARY = 'Hôm nay cần nhắc tiền thuê Phòng 5 Dãy trọ Dĩ An, hỏi gia hạn Căn hộ Thủ Đức và hoàn cọc Phòng 7 Dãy trọ Dĩ An.';

let worker: AgentWorker | undefined;

/** A household's own clock row wins over the global one the worker beats on, so a row an earlier spec left on the lane would skew "now". Move both. */
async function freeze(request: Parameters<typeof setClock>[0], frozenNow: string | null) {
  await setClock(request, globalClock, frozenNow);
  await setClock(request, lanes(LANE), frozenNow);
}

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await freeze(request, null);
});

const brief = (page: Page) => page.locator('[data-testid="inbox-item"][data-kind="brief"]');

test('before any brief that day, Home says Trợ lý has not written one yet', async ({ page, request }) => {
  await freeze(request, '2026-10-06T08:00:00+07:00');
  await open(page, ME, 'light', PHONE);
  await page.goto('/');
  await expect(page.getByTestId('home-brief-empty')).toHaveText('Trợ lý chưa viết ghi chú hôm nay.');
  await expect(page.getByTestId('home-brief-open')).toHaveAttribute('href', '/assistant');
});

test('at 07:05 Mẹ reads the 07:00 brief in her thread, opens Phòng 5 from it, and finds its summary on Home', async ({ page, request }) => {
  await freeze(request, `${TODAY}T07:00:00+07:00`);
  worker = await startAgentWorker({ schedule: true });
  await expect
    .poll(async () => (await serviceGet<unknown[]>(page, `agent_jobs?kind=eq.morning_brief&status=eq.done&idempotency_key=eq.morning_brief:${laneHousehold(LANE)}:${TODAY}&select=id`)).length, {
      timeout: 90_000,
    })
    .toBe(1);
  await freeze(request, `${TODAY}T07:05:00+07:00`);

  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');
  await expect(page.getByTestId('worker-ran')).toHaveText('Trợ lý chạy lúc 07:00.');
  await expect(brief(page), 'the day’s one brief sits in her thread').toHaveCount(1);
  await expect(brief(page).getByRole('heading', { level: 3 })).toHaveText(SUMMARY);
  await expect(brief(page).locator('strong')).toHaveText(['Cần làm', 'Theo dõi', 'Thị trường']);
  const todo = brief(page).getByRole('list').first().getByRole('listitem');
  await expect(todo).toHaveText([
    `Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày, còn nợ ${vnd('2.800.000')}`,
    'Hợp đồng Căn hộ Thủ Đức hết hạn ngày 01/11/2026, còn 25 ngày',
    `Phòng 7 Dãy trọ Dĩ An chưa hoàn tiền cọc ${vnd('2.800.000')}, hợp đồng kết thúc ngày 15/09/2026`,
  ]);
  const market = brief(page).getByRole('list').nth(2).getByRole('listitem');
  await expect(market, 'the three most relevant items of the 06:00 scan, each with its source').toHaveCount(3);
  await expect(market.first()).toContainText('Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An');
  await expect(market.getByTestId('citation-chip')).toHaveText(['Tin tức Demo · 05/10/2026', 'Pháp luật Demo · 20/09/2026', 'Báo Demo · 06/10/2026']);
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
  await expect(page).toHaveURL(/\/assistant\?note=[0-9a-f-]{36}$/);
  await expect(brief(page), 'the link opens the thread at the brief').toBeInViewport();

  await page.goto('/');
  await home.getByTestId('home-brief-reply').click();
  await expect(page).toHaveURL(/\/assistant\?reply=[0-9a-f-]{36}$/);
  await expect(page.getByTestId('composer-topic'), 'Trả lời on Home’s brief quotes it above the reply box').toContainText(`Trả lời: ${SUMMARY}`);
});

test('with the worker stopped and the clock 15 minutes on, every page says Trợ lý is offline', async ({ page, request }) => {
  await worker?.stop();
  await freeze(request, `${TODAY}T07:20:00+07:00`);
  await open(page, ME, 'light', DESKTOP);
  for (const path of ['/', '/properties', '/collections', '/assistant']) {
    await page.goto(path);
    await expect(page.getByTestId('worker-status'), path).toHaveText(/^Trợ lý nghỉ từ 07:0\d\. Việc mới sẽ được làm khi Trợ lý chạy lại; mọi thứ khác vẫn dùng bình thường\.$/);
  }
  expect(await seriousAxeViolations(page)).toEqual([]);
});
