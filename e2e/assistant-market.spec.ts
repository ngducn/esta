import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { setClock } from './helpers/test-clock';
import { clippedText } from './helpers/text-scale';
import { DESKTOP, noSidewaysScroll, open, PHONE, serviceGet, servicePatch, seriousAxeViolations } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const LANE = 3;
const ME = `me.lane${LANE}@demo.esta.test`;
const DI_AN = seedId(`seed:property:lane-${LANE}:di-an`);
const RING_ROAD = 'https://tintuc.example.vn/ha-tang/vanh-dai-3-doan-qua-di-an-sap-khoi-cong';

let worker: AgentWorker | undefined;

test.beforeAll(async ({ request }) => {
  await setClock(request, '2026-10-07T07:00:00+07:00');
  worker = await startAgentWorker({ schedule: true });
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const items = (page: Page) => page.getByTestId('market-item');

async function scanned(page: Page) {
  await expect
    .poll(async () => (await serviceGet<unknown[]>(page, 'agent_jobs?status=in.(queued,running)&run_after=lte.2026-10-07T00:00:00Z&select=id')).length, { timeout: 120_000 })
    .toBe(0);
  await setClock(page.request, '2026-10-07T07:05:00+07:00');
}

test('Mẹ reads the morning’s market news on Thị trường, each item with its source, and the topics Trợ lý follows', async ({ page }) => {
  await open(page, ME, 'light', DESKTOP);
  await scanned(page);
  await page.goto('/assistant');
  await page.getByRole('navigation', { name: 'Các mục của Trợ lý' }).getByRole('link', { name: 'Thị trường' }).click();
  await expect(page).toHaveURL(/\/assistant\/market$/);
  await expect(page.getByRole('link', { name: 'Thị trường' })).toHaveAttribute('aria-current', 'page');

  await expect(items(page)).toHaveCount(4);
  await expect(page.getByTestId('market-count')).toHaveText('4 tin');
  for (const item of await items(page).all()) {
    const chip = item.getByTestId('citation-chip');
    await expect(chip).toHaveText(/ · \d{2}\/\d{2}\/2026$/);
    await expect(chip).toHaveAttribute('href', /^https:\/\//);
    await expect(chip).toHaveAttribute('target', '_blank');
  }
  const first = items(page).first();
  await expect(first.getByRole('heading', { level: 3 })).toHaveText('Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An');
  await expect(first.getByTestId('citation-chip')).toHaveAttribute('href', RING_ROAD);
  await expect(first.getByTestId('citation-chip')).toHaveAccessibleName('Nguồn 1: Tin tức Demo, ngày 05/10/2026. Mở trong thẻ mới');
  await page.context().route('https://tintuc.example.vn/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Demo</title>' }));
  const popup = page.waitForEvent('popup');
  await first.getByTestId('citation-chip').click();
  expect((await popup).url()).toBe(RING_ROAD);

  const topics = page.getByTestId('topics');
  await expect(topics.getByTestId('topic')).toContainText(['Lâm Đồng', 'Tây Ninh (Long An cũ)', 'TP. Đồng Nai', 'TP. Hồ Chí Minh (Bình Dương cũ)']);
  await expect(topics.locator('button, input, select, textarea, a'), 'the topics are read-only').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('on her phone in dark, Mẹ filters Thị trường to Dãy trọ Dĩ An and sees only the news that concerns it', async ({ page }) => {
  await open(page, ME, 'dark', PHONE);
  await page.goto('/assistant/market');
  await page.getByRole('navigation', { name: 'Lọc theo tài sản' }).getByRole('link', { name: /^Dãy trọ Dĩ An/ }).click();
  await expect(page).toHaveURL(new RegExp(`/assistant/market\\?property=${DI_AN}$`));
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByTestId('market-count')).toHaveText('2 tin');
  for (const why of await page.getByTestId('market-why').all()) await expect(why).toContainText(/Dĩ An|TP\. Hồ Chí Minh/);
  for (const chip of await page.getByTestId('citation-chip').all()) expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByRole('link', { name: /^Tất cả/ }).click();
  await expect(items(page)).toHaveCount(4);
});

test('in English at 130% text, Thị trường reads in English, keeps dates as dd/mm/yyyy and cuts no long title or source', async ({ page }) => {
  await open(page, ME, 'dark', PHONE);
  const member = `household_members?id=eq.${seedId(`seed:member:me-lane-${LANE}`)}`;
  await servicePatch(page, member, { locale: 'en', text_scale: 130 });
  try {
    await page.goto('/assistant/market');
    await expect(page.getByRole('navigation', { name: 'Assistant sections' }).getByRole('link', { name: 'Market' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('market-count')).toHaveText('4 items');
    await expect(items(page).first().getByTestId('citation-chip')).toContainText('Tin tức Demo · 05/10/2026');
    await expect(page.getByRole('heading', { name: 'Topics followed' })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await clippedText(page)).toEqual([]);
  } finally {
    await servicePatch(page, member, { locale: 'vi', text_scale: 100 });
  }
});
