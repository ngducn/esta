import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { undoSheetPayments } from './helpers/board';
import { initialJs, INITIAL_JS_BUDGET_BYTES } from './helpers/bundle';
import { stubTiles, TILE_HOST } from './helpers/map-tiles';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, openNewHousehold, PHONE, recordForPr, seriousAxeViolations, START, toast } from './helpers/wizard';

const hold = recordForPr();

// Home reads the whole household, so the read rules sign in to the main Demo household, which no other spec writes,
// and every payment a rule records is undone after it. Today's list follows the Clock, so the spec runs in the `clock`
// project on SPEC §9.3's day.
const MOM = 'me@demo.esta.test';
const RYAN = 'ryan@demo.esta.test';
const DEMO = seedId('seed:household:demo');
const PHONG_5 = 'Phòng 5, Dãy trọ Dĩ An';
const THU_DUC = 'Căn hộ Thủ Đức';
const Q7_INSURANCE = 'Bảo hiểm cháy nổ Nhà phố Q7';
const GROUPS = ['overdue', 'due', 'notDue', 'paid'] as const;

test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

test.afterEach(async ({ page }) => {
  await undoSheetPayments(page, DEMO);
});

const items = (page: Page) => page.getByTestId('today-item');
const item = (page: Page, title: string) => items(page).filter({ has: page.getByTestId('today-title').getByText(title, { exact: true }) });
const titles = (page: Page) => page.getByTestId('today-title').allInnerTexts();
const actions = (page: Page) => items(page).locator('[data-testid="today-action"], [data-testid="row-action-record-payment"]').allInnerTexts();

async function homeFigure(page: Page) {
  const figure = page.getByTestId('month-figure');
  return { collected: Number(await figure.getAttribute('data-collected-vnd')), billed: Number(await figure.getAttribute('data-billed-vnd')) };
}

async function homeCounts(page: Page) {
  return Object.fromEntries(await Promise.all(GROUPS.map(async (key) => [key, Number(await page.getByTestId(`month-group-${key}`).getAttribute('data-count'))] as const)));
}

async function boardCounts(page: Page) {
  await page.goto('/collections');
  await expect(page.getByTestId('collections-board')).toBeVisible();
  return Object.fromEntries(await Promise.all(GROUPS.map(async (key) => [key, await page.getByTestId(`group-${key}`).getByTestId('collections-row').count()] as const)));
}

/** X and Y read straight from `invoice_balances`: issued bills due in the month, allocations capped at each bill. */
async function balancesFor(page: Page, householdId: string, month: string, next: string) {
  const bills = await memberRest<{ total_vnd: number; allocated_vnd: number }[]>(
    page,
    'GET',
    `invoice_balances?household_id=eq.${householdId}&status=eq.issued&due_date=gte.${month}&due_date=lt.${next}&select=total_vnd,allocated_vnd`,
  );
  return {
    collected: bills.reduce((sum, bill) => sum + Math.min(bill.allocated_vnd, bill.total_vnd), 0),
    billed: bills.reduce((sum, bill) => sum + bill.total_vnd, 0),
  };
}

/** SPEC §9.3 on 07/10: three items in order, each with its one action, and October at 54 tr of 69,6 tr. */
async function expectSeedHome(page: Page) {
  await expect(page.getByTestId('date-line')).toHaveText('Thứ Tư, 07/10/2026');
  await expect(page.getByRole('heading', { level: 2, name: 'Cần làm hôm nay' })).toBeVisible();
  expect(await titles(page)).toEqual([PHONG_5, THU_DUC, Q7_INSURANCE]);
  expect(await actions(page)).toEqual(['Ghi nhận', 'Gia hạn', 'Xem tài liệu']);
  await expect(item(page, PHONG_5).locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(item(page, THU_DUC)).toContainText('Hợp đồng hết hạn 01/11/2026, còn 25 ngày');
  await expect(item(page, Q7_INSURANCE)).toContainText('Hết hạn sau 23 ngày');
  await expect(page.getByTestId('today-more')).toHaveCount(0);
  expect(await homeFigure(page)).toEqual({ collected: 54_000_000, billed: 69_600_000 });
  await expect(page.getByTestId('month-figure')).toContainText('54 tr');
  await expect(page.getByTestId('month-figure')).toContainText('69,6 tr');
  await expect(page.getByTestId('month-rest')).toHaveText('Còn 15.600.000 ₫ chưa thu');
  expect(await homeCounts(page)).toEqual({ overdue: 1, due: 0, notDue: 6, paid: 2 });
}

test('Mẹ opens Tổng quan at 390 on 07/10 and sees Phòng 5, the Thủ Đức lease and the Q7 insurance, and October at 54 tr of 69,6 tr', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', async (response) => {
    if (response.url().startsWith(TILE_HOST)) scripts.push(response.url());
    else if (/\/_next\/static\/chunks\/.+\.js/.test(response.url()) && (await response.text().catch(() => '')).includes('maplibregl-canvas')) scripts.push(response.url());
  });
  await open(page, MOM, 'light', PHONE);
  await expectSeedHome(page);
  await expect(page.getByTestId('home-map-strip')).toBeHidden();
  await page.waitForLoadState('networkidle');
  expect(scripts, 'a phone fetches no MapLibre chunk and no tile').toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('Ryan reads the same Home at 1440 in dark, with the pinned properties on the map strip', async ({ page }) => {
  await stubTiles(page);
  await open(page, RYAN, 'dark', DESKTOP);
  await expectSeedHome(page);
  const strip = page.getByTestId('home-map-strip');
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('map-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(strip.locator('[data-testid="property-pin"], [data-testid="pin-group"]').first()).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('Home’s figure and counts equal the board and invoice_balances for the same household and month', async ({ page }) => {
  for (const [email, householdId] of [
    [MOM, DEMO],
    ['ryan.lane9@demo.esta.test', laneHousehold(9)],
  ] as const) {
    await open(page, email, 'light', DESKTOP);
    const figure = await homeFigure(page);
    const counts = await homeCounts(page);
    expect(figure, `${email}: X and Y`).toEqual(await balancesFor(page, householdId, '2026-10-01', '2026-11-01'));
    expect(counts, `${email}: the group counts`).toEqual(await boardCounts(page));
    await page.context().clearCookies();
  }
});

test('on 25/10 nine things are due and Home shows seven, with Xem tất cả ở Thu tiền', async ({ page, request }) => {
  await setClock(request, '2026-10-25T09:00:00+07:00');
  try {
    await open(page, RYAN, 'light', DESKTOP);
    await expect(page.getByTestId('today-count')).toHaveText('9 việc');
    expect(await titles(page)).toEqual([PHONG_5, THU_DUC, Q7_INSURANCE, ...[1, 2, 3, 4].map((n) => `Phòng ${n}, Dãy trọ Dĩ An`)]);
    await expect(item(page, PHONG_5).locator('[data-status="overdue"]')).toHaveText('Quá hạn 30 ngày');
    await expect(item(page, 'Phòng 1, Dãy trọ Dĩ An').locator('[data-status="due"]')).toHaveText('Đến hạn');
    await expect(page.getByTestId('today-more')).toHaveText('Xem tất cả ở Thu tiền');
    expect(await homeCounts(page)).toEqual({ overdue: 1, due: 6, notDue: 0, paid: 2 });
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.getByTestId('today-more').click();
    await expect(page).toHaveURL(/\/collections$/);
  } finally {
    await setClock(request, START);
  }
});

test('Mẹ records Phòng 5 from Home: the item leaves, October’s figure stays, and Hoàn tác brings it back', async ({ page }) => {
  await open(page, MOM, 'light', PHONE);
  await expect(item(page, PHONG_5)).toBeVisible();
  await hold(page);
  await item(page, PHONG_5).getByRole('button', { name: 'Ghi nhận' }).click();
  const sheet = page.getByTestId('record-payment-sheet');
  await expect(sheet.getByTestId('payment-place')).toHaveText(PHONG_5);
  await sheet.getByText('Tiền mặt', { exact: true }).click();
  await hold(page);
  await sheet.getByTestId('payment-save').click();
  await expect(toast(page)).toContainText('Đã ghi nhận 2.800.000 ₫ từ Phòng 5.');
  await expect(item(page, PHONG_5)).toHaveCount(0);
  expect(await titles(page)).toEqual([THU_DUC, Q7_INSURANCE]);
  const recorded = await memberRest<{ amount_vnd: number; method: string }[]>(page, 'GET', `payments?household_id=eq.${DEMO}&idempotency_key=not.is.null&select=amount_vnd,method`);
  expect(recorded).toEqual([{ amount_vnd: 2_800_000, method: 'cash' }]);
  expect(await homeFigure(page), 'September’s bill is not October’s, so X stays').toEqual({ collected: 54_000_000, billed: 69_600_000 });
  expect(await homeCounts(page)).toEqual({ overdue: 0, due: 0, notDue: 6, paid: 2 });
  await hold(page);
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(item(page, PHONG_5)).toBeVisible();
  await hold(page);
});

test('Gia hạn opens the Thủ Đức lease with the renew sheet ready, and Xem tài liệu opens the insurance', async ({ page }) => {
  await open(page, MOM, 'light', PHONE);
  await item(page, THU_DUC).getByRole('link', { name: 'Gia hạn' }).click();
  await expect(page).toHaveURL(/\/rental\/leases\/[0-9a-f-]+\?renew=1$/);
  await expect(page.getByTestId('renew-sheet')).toBeVisible();
  await page.goto('/');
  await item(page, Q7_INSURANCE).getByRole('link', { name: 'Xem tài liệu' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(Q7_INSURANCE);
});

test('a new household has nothing to do and no bill this month, and draws no empty box or map', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  await page.goto('/');
  await expect(page.getByTestId('today-empty')).toHaveText('Hôm nay không có việc cần làm.');
  await expect(page.getByTestId('month-empty')).toHaveText('Chưa có hóa đơn nào đến hạn trong tháng 10/2026.');
  await expect(page.getByTestId('month-figure')).toHaveCount(0);
  await expect(page.getByTestId('home-map-strip')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('offline, Home says it could not load and keeps the last list', async ({ page }) => {
  await open(page, MOM, 'light', PHONE);
  await expect(item(page, PHONG_5)).toBeVisible();
  await expect(page.getByTestId('home-offline')).toHaveCount(0);
  await page.context().setOffline(true);
  try {
    await expect(page.getByTestId('home-offline')).toHaveText('Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.');
    await expect(item(page, PHONG_5)).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
  await expect(page.getByTestId('home-offline')).toHaveCount(0);
});

test('in English at 130% the Phòng 5 item reads in English with its action, and the figure wraps without sideways scroll', async ({ page }) => {
  await open(page, MOM, 'dark', PHONE);
  await inEnglishAt130(page, seedId('seed:member:me-demo'), async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'To do today' })).toBeVisible();
    await expect(item(page, PHONG_5).locator('[data-status="overdue"]')).toHaveText('12 days overdue');
    await expect(item(page, PHONG_5).getByRole('button', { name: 'Record' })).toBeVisible();
    await expect(page.getByTestId('month-figure')).toContainText('Collected');
    expect(await noSidewaysScroll(page)).toBe(true);
    const clipped = await page
      .getByTestId('month-figure')
      .evaluate((figure) => [...figure.querySelectorAll('span:not(.sr-only)')].some((span) => span.scrollWidth > span.clientWidth + 1 || span.getBoundingClientRect().right > window.innerWidth));
    expect(clipped, 'no part of the figure is cut off').toBe(false);
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});

test('signed in, / ships no next-intl client runtime and stays under the initial JS budget', async ({ page }) => {
  test.skip(!process.env.CI && process.env.ESTA_E2E_SERVER !== 'build', 'the budget is for a production build; a dev server ships unminified chunks');
  await open(page, MOM, 'light', PHONE);
  const measured = await initialJs(page.request, '/');
  expect(measured.withIntlRuntime).toEqual([]);
  expect(measured.gzippedBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
});
