import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { VALUATION_SEEDS } from '../supabase/seed/generator/valuations.ts';
import { inEnglishAt130, memberRest as rest } from './helpers/auth-api';
import { stubTiles } from './helpers/map-tiles';
import { laneHousehold, laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, START, toast } from './helpers/wizard';

const hold = recordForPr();

// The sheet dates a valuation on the Clock's day and the block counts its age from it, so the spec runs in the `clock`
// project on SPEC §9.3's day. Each rule reads its own lane household. A rule that deletes a seeded valuation restores it,
// and every other valuation a rule writes is removed after it.
const SEEDED = (Object.keys(VALUATION_SEEDS) as (keyof typeof VALUATION_SEEDS)[]).flatMap((key) =>
  Array.from({ length: 10 }, (_, i) => seedId(`seed:valuation:lane-${i + 1}:${key}`)),
);
/** Q1's 30.000.000 a month under its annual lease in effect on 2026-10-07. */
const Q1_ANNUAL_RENT = 360_000_000;
const FULL_PORTFOLIO = 45_250_000_000;

test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

test.afterEach(async ({ page }) => {
  if (!(await page.context().cookies()).some((cookie) => cookie.name.startsWith('sb-'))) return;
  await rest(page, 'DELETE', `valuations?id=not.in.(${SEEDED.join(',')})`);
});

const block = (page: Page) => page.getByTestId('valuation-block');
const sheet = (page: Page) => page.getByTestId('valuation-sheet');
const stored = (page: Page, propertyId: string) => rest<{ id: string }[]>(page, 'GET', `valuations?property_id=eq.${propertyId}&select=id`);

/** Rounds half up, as `grossYieldBp` does: annual rent over value in whole basis points. */
const yieldBp = (annualRent: number, value: number) => Math.floor((annualRent * 20_000 + value) / (2 * value));

async function addValuation(page: Page, { value, method, date, source }: { value: string; method: string; date?: string; source?: string }) {
  await block(page).getByTestId('add-valuation').click();
  await expect(sheet(page).getByRole('heading', { name: 'Thêm định giá' })).toBeVisible();
  await sheet(page).getByRole('textbox', { name: 'Giá trị' }).fill(value);
  await sheet(page).getByRole('radio', { name: method, exact: true }).locator('xpath=..').click();
  if (date !== undefined) await sheet(page).getByRole('textbox', { name: 'Ngày định giá' }).fill(date);
  if (source !== undefined) await sheet(page).getByTestId('valuation-source').fill(source);
  await sheet(page).getByTestId('valuation-save').click();
}

test('lane 2: Ryan records a broker quote of 9ty5 on Mặt bằng Quận 1; the block and its gross yield name that date, and Home sums it', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'light', DESKTOP);
  const q1 = laneProperty(2, 'q1');
  await page.goto(`/properties/${q1}`);
  await expect(block(page).getByTestId('valuation-yield')).toHaveText('Lợi suất gộp 5%, theo ước tính ngày 01/07/2026');

  await addValuation(page, { value: '9ty5', method: 'Môi giới báo giá', date: '07/10/2026', source: 'https://example.com/demo/bao-gia-q1' });
  await expect(sheet(page)).toBeHidden();
  await expect(toast(page)).toContainText('Đã ghi định giá 9,5 tỷ.');
  await expect(block(page).getByTestId('valuation-latest')).toHaveText('9,5 tỷ');
  await expect(block(page).getByTestId('valuation-latest')).toHaveAttribute('data-value-vnd', '9500000000');
  await expect(block(page)).toContainText('Ước tính');
  await expect(block(page).getByTestId('valuation-meta')).toHaveText('Ngày 07/10/2026, Môi giới báo giá, hôm nay');
  await expect(block(page).getByRole('link', { name: 'Xem nguồn' })).toHaveAttribute('href', 'https://example.com/demo/bao-gia-q1');
  const bp = yieldBp(Q1_ANNUAL_RENT, 9_500_000_000);
  expect(bp, '360.000.000 over 9.500.000.000 is 378,9 bp').toBe(379);
  await expect(block(page).getByTestId('valuation-yield')).toHaveAttribute('data-yield-bp', String(bp));
  await expect(block(page).getByTestId('valuation-yield')).toHaveText('Lợi suất gộp 3,79%, theo ước tính ngày 07/10/2026');
  await expect(block(page).getByTestId('valuation-history').getByRole('listitem')).toHaveCount(2);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.goto('/');
  await expect(page.getByTestId('portfolio-total')).toHaveAttribute('data-total-vnd', String(FULL_PORTFOLIO - 7_200_000_000 + 9_500_000_000));
  await expect(page.getByTestId('portfolio-total')).toHaveText('47,55 tỷ');
});

test('lane 3: Mẹ opens Đất Bảo Lộc at 390 dark, reads the age of its seeded valuation, records a broker quote and sees Home change', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  const baoLoc = laneProperty(3, 'bao-loc');
  const [seeded] = await rest<{ as_of: string; value_vnd: number }[]>(page, 'GET', `valuations?property_id=eq.${baoLoc}&select=as_of,value_vnd&order=as_of.desc&limit=1`);
  expect(seeded?.as_of).toBe('2026-04-20');
  await page.goto('/');
  await expect(page.getByTestId('portfolio-total')).toHaveText('45,25 tỷ');
  await expect(page.getByTestId('portfolio-basis')).toHaveText('Theo lần định giá gần nhất của từng bất động sản, cũ nhất ngày 15/11/2025.');
  await hold(page);

  await page.goto(`/properties/${baoLoc}`);
  await block(page).scrollIntoViewIfNeeded();
  // 2026-04-20 to 2026-10-07 is five whole months and 17 days.
  await expect(block(page).getByTestId('valuation-age')).toHaveAttribute('data-months', '5');
  await expect(block(page).getByTestId('valuation-age')).toHaveText('cách đây 5 tháng');
  await expect(block(page).getByTestId('valuation-latest')).toHaveText('3,2 tỷ');
  await expect(block(page).getByTestId('valuation-yield'), 'land with no lease in effect shows no yield, not 0%').toHaveCount(0);
  await hold(page);

  await addValuation(page, { value: '3ty5', method: 'Môi giới báo giá' });
  await expect(block(page).getByTestId('valuation-latest')).toHaveText('3,5 tỷ');
  await expect(block(page).getByTestId('valuation-age')).toHaveText('hôm nay');
  expect(await noSidewaysScroll(page)).toBe(true);
  await hold(page);

  await page.goto('/');
  await expect(page.getByTestId('portfolio-total')).toHaveText('45,55 tỷ');
  await expect(page.getByTestId('portfolio-total')).toHaveAttribute('data-total-vnd', String(FULL_PORTFOLIO - 3_200_000_000 + 3_500_000_000));
  await hold(page);
});

test('lane 4: an http: source, a later date and no method are refused on their fields in Vietnamese, and nothing is written', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  const q7 = laneProperty(4, 'q7');
  const before = await stored(page, q7);
  await page.goto(`/properties/${q7}`);
  await block(page).getByTestId('add-valuation').click();
  await sheet(page).getByRole('textbox', { name: 'Giá trị' }).fill('15ty');
  await sheet(page).getByTestId('valuation-save').click();
  await expect(sheet(page).getByText('Chọn cách định giá.')).toBeVisible();

  await sheet(page).getByRole('radio', { name: 'So sánh giá khu vực', exact: true }).locator('xpath=..').click();
  await sheet(page).getByRole('textbox', { name: 'Ngày định giá' }).fill('08/10/2026');
  await sheet(page).getByTestId('valuation-source').fill('http://example.com');
  await sheet(page).getByTestId('valuation-save').click();
  await expect(sheet(page).getByText('Liên kết phải bắt đầu bằng https://')).toBeVisible();
  await expect(sheet(page).getByTestId('valuation-source')).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet(page).getByText('Ngày định giá không được sau hôm nay.')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await stored(page, q7)).toEqual(before);
});

test('lane 5: Home at 1440 light shows the portfolio figure as an estimate with its date beside Đã thu and Cần làm hôm nay, with no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await stubTiles(page);
  await open(page, 'me.lane5@demo.esta.test', 'light', DESKTOP);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Cần làm hôm nay' })).toBeVisible();
  await expect(page.getByTestId('month-figure')).toContainText('Đã thu');
  const figure = page.getByTestId('portfolio-figure');
  await expect(figure.getByRole('heading', { name: 'Tổng giá trị bất động sản' })).toBeVisible();
  await expect(figure).toContainText('Ước tính');
  await expect(page.getByTestId('portfolio-total')).toHaveText('45,25 tỷ');
  await expect(page.getByTestId('portfolio-basis')).toContainText('15/11/2025');
  await expect(page.getByTestId('portfolio-missing')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('lane 6: deleting a property’s only valuation offers Hoàn tác, empties the block, and Home counts the property without one', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'light', PHONE);
  const longAn = laneProperty(6, 'long-an');
  await page.goto(`/properties/${longAn}`);
  const remove = block(page).getByRole('button', { name: /^Xoá định giá 1,85 tỷ ngày 15\/11\/2025$/ });
  await remove.click();
  await expect(toast(page)).toContainText('Đã xoá định giá 1,85 tỷ.');
  await expect(block(page)).toContainText('Chưa có định giá cho bất động sản này.');
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(toast(page)).toContainText('Đã khôi phục định giá 1,85 tỷ.');
  await expect(block(page).getByTestId('valuation-latest')).toHaveText('1,85 tỷ');
  expect(await stored(page, longAn)).toEqual([{ id: seedId('seed:valuation:lane-6:long-an') }]);

  await block(page).getByRole('button', { name: /^Xoá định giá/ }).click();
  await expect(block(page)).toContainText('Chưa có định giá cho bất động sản này.');
  try {
    await page.goto('/');
    await expect(page.getByTestId('portfolio-total')).toHaveText('43,4 tỷ');
    await expect(page.getByTestId('portfolio-missing')).toHaveText('1 bất động sản chưa có định giá');
    await expect(page.getByTestId('portfolio-basis')).toContainText('01/02/2026');
  } finally {
    const seed = VALUATION_SEEDS['long-an'];
    await rest(page, 'POST', 'valuations', {
      id: seedId('seed:valuation:lane-6:long-an'),
      household_id: laneHousehold(6),
      property_id: longAn,
      as_of: seed.asOf,
      value_vnd: seed.valueVnd,
      method: seed.method,
    });
  }
});

test('lane 10: in English at 130% and dark, Home reads the portfolio figure with its estimate label and date, unclipped', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    await page.goto('/');
    const figure = page.getByTestId('portfolio-figure');
    await expect(figure.getByRole('heading', { name: 'Total property value' })).toBeVisible();
    await expect(figure).toContainText('Estimate');
    await expect(page.getByTestId('portfolio-total')).toHaveText('45.25B ₫');
    await expect(page.getByTestId('portfolio-basis')).toHaveText("From each property's latest valuation, the oldest dated 15/11/2025.");
    expect(await noSidewaysScroll(page)).toBe(true);
    const box = await page.getByTestId('portfolio-total').boundingBox();
    expect(box !== null && box.x >= 0 && box.x + box.width <= PHONE.width).toBe(true);
  });
});
