import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { laneHousehold, laneLease, laneLeasePath } from './helpers/seed';
import { clippedText } from './helpers/text-scale';
import { cardVnd, expectedTaxPosition, printedVnd } from './helpers/tax';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, shot } from './helpers/wizard';

const pause = recordForPr();

test.beforeEach(() => test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport, and rules 4 and 5 write their lane'));

const ME = 'Nguyễn Thị Demo';
const RYAN = 'Trần Minh Demo';
const SOURCE = 'Nguồn: Luật Thuế TNCN 109/2025/QH15; Luật sửa đổi Luật Thuế GTGT; Nghị định 68/2026/NĐ-CP';

const card = (page: Page) => page.getByTestId('tax-position');
const figure = async (page: Page, testId: string) => printedVnd(await page.getByTestId(testId).innerText());

async function otherRevenueRows(page: Page, lane: number) {
  return memberRest<{ year: number; other_business_revenue_vnd: number }[]>(
    page,
    'GET',
    `owner_tax_inputs?household_id=eq.${laneHousehold(lane)}&party_id=eq.${seedId(`seed:party:me-lane-${lane}`)}&select=year,other_business_revenue_vnd`,
  );
}

async function saveOtherRevenue(page: Page, amount: string) {
  const form = page.getByTestId('tax-other-revenue');
  await form.getByRole('textbox').fill(amount);
  await form.getByTestId('tax-other-save').click();
  await expect(form.getByTestId('tax-other-status')).toHaveAttribute('data-status', 'saved');
}

test('rule 1: Mẹ opens her tax card from Báo cáo and reads 2026 against the 500 million threshold with no tax to pay (FIN-3, SPEC §9.3)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto('/reports');
  await pause(page);
  await page.getByRole('link', { name: 'Mở thẻ thuế' }).click();
  await expect(page).toHaveURL(/\/reports\/tax$/);
  await expect(page.getByTestId('tax-owners').getByRole('link', { name: ME })).toHaveAttribute('aria-current', 'page');
  const expected = await expectedTaxPosition(page, ME, 2026, '2026-10-07');
  await expect(page.getByTestId('tax-projected')).toHaveText(cardVnd(expected.projectedVnd));
  expect(expected.projectedVnd, 'SPEC §9.3 puts Mẹ between 400 and 500 million').toBeGreaterThanOrEqual(400_000_000);
  expect(expected.projectedVnd).toBeLessThanOrEqual(499_999_999);
  await expect(page.getByTestId('tax-progress')).toHaveText(`Đạt ${Math.floor(expected.progressBp / 100)}% ngưỡng ${cardVnd(500_000_000)}`);
  expect(expected.progressBp).toBeGreaterThanOrEqual(8_000);
  await expect(page.getByTestId('tax-remaining')).toHaveText(`Còn ${cardVnd(500_000_000 - expected.projectedVnd)} đến ngưỡng`);
  await expect(page.getByTestId('tax-vat')).toHaveText(cardVnd(0));
  await expect(page.getByTestId('tax-pit')).toHaveText(cardVnd(0));
  for (const disclaimer of await page.getByTestId('tax-disclaimer').all()) await expect(disclaimer).toHaveText(`Ước tính, không phải tư vấn thuế. ${SOURCE}`);
  await expect(page.getByTestId('tax-disclaimer')).toHaveCount(3);

  await expect(page.getByTestId('tax-accrued')).toHaveText(`Đã ghi nhận đến 07/10/2026: ${cardVnd(expected.accruedVnd)}`);
  expect(expected.accruedVnd).toBeLessThanOrEqual(expected.projectedVnd);
  await expect(page.locator('[data-note="pit_effective_date"]')).toHaveText(/^Giả định: Ngày áp dụng thuế TNCN: Các nguồn chưa thống nhất/);
  await expect(page.locator('[data-note="deduction_split"]')).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p4-04-me-card-390-light');
  await pause(page);
});

test('rule 2: Ryan opens on his own card, below 400 million, with Thủ Đức and Biên Hòa at 50% and the co-owner assumption', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/reports/tax');
  await expect(page.getByTestId('tax-owners').getByRole('link', { name: RYAN })).toHaveAttribute('aria-current', 'page');
  const expected = await expectedTaxPosition(page, RYAN, 2026, '2026-10-07');
  await expect(page.getByTestId('tax-projected')).toHaveText(cardVnd(expected.projectedVnd));
  expect(expected.projectedVnd).toBeLessThan(400_000_000);
  const leases = page.getByTestId('tax-lease');
  await expect(leases).toHaveCount(2);
  await expect(leases.nth(0)).toContainText('Căn hộ Thủ Đức');
  await expect(leases.nth(1)).toContainText('Kho Biên Hòa');
  for (const lease of await leases.all()) await expect(lease).toContainText('Phần sở hữu 50%');
  await expect(page.locator('[data-note="co_owner_split"]')).toHaveText('Giả định: Doanh thu nhà đồng sở hữu được chia theo tỷ lệ sở hữu');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p4-04-ryan-card-1440-dark');
});

test('rule 3: the Bên thuê nộp thay group lists Nhà phố Q7, and opening it leaves VAT and PIT as they were', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await page.goto('/reports/tax');
  const expected = await expectedTaxPosition(page, ME, 2026, '2026-10-07');
  const [withheld] = expected.withheldLeases;
  const before = [await page.getByTestId('tax-vat').innerText(), await page.getByTestId('tax-pit').innerText()];
  const group = page.getByTestId('tax-withheld');
  await expect(group.locator('summary')).toHaveText(`Bên thuê nộp thay: 1 hợp đồng, ${cardVnd(withheld?.projectedVnd ?? -1)}`);
  await group.locator('summary').click();
  await expect(group.getByTestId('tax-withheld-lease')).toHaveCount(1);
  await expect(group.getByTestId('tax-withheld-lease')).toContainText('Nhà phố Q7');
  await expect(group.getByTestId('tax-withheld-lease')).toHaveAttribute('data-lease-id', laneLease(3, 'q7', 1));
  expect([await page.getByTestId('tax-vat').innerText(), await page.getByTestId('tax-pit').innerText()]).toEqual(before);
  await expect(page.getByTestId('tax-self-declared')).toHaveText(`Tính trên ${cardVnd(expected.selfDeclaredVnd)} doanh thu bạn tự khai`);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 4: 200tr of other business revenue crosses the threshold, VAT is 5% of the self-declared figure and PIT stays 0', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'light', DESKTOP);
  await page.goto('/reports/tax');
  try {
    await saveOtherRevenue(page, '200tr');
    await expect(card(page)).toHaveAttribute('data-over', 'true');
    await expect(page.getByTestId('tax-progress')).toHaveText(`Vượt ngưỡng ${cardVnd(500_000_000)}`);
    const selfDeclared = await figure(page, 'tax-self-declared');
    expect(await figure(page, 'tax-vat'), 'VAT is 500 bp of the self-declared figure, half up').toBe(Math.floor((selfDeclared * 500 + 5_000) / 10_000));
    expect(await figure(page, 'tax-vat')).toBeGreaterThan(0);
    await expect(page.getByTestId('tax-pit')).toHaveText(cardVnd(0));
    await expect(page.locator('[data-note="deduction_split"]')).toHaveText('Lưu ý: hỏi kế toán về cách trừ 500 triệu');
    expect(await otherRevenueRows(page, 4)).toEqual([{ year: 2026, other_business_revenue_vnd: 200_000_000 }]);
    await shot(page, 'p4-04-other-revenue-1440-light');
  } finally {
    await saveOtherRevenue(page, '0');
  }
});

test('rule 5: saving 200tr twice and then 0 leaves one row at 0 and the card back at the seed figures', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto('/reports/tax');
  await pause(page);
  await saveOtherRevenue(page, '200tr');
  await pause(page);
  await saveOtherRevenue(page, '200tr');
  await saveOtherRevenue(page, '0');
  await pause(page);
  expect(await otherRevenueRows(page, 5)).toEqual([{ year: 2026, other_business_revenue_vnd: 0 }]);
  const expected = await expectedTaxPosition(page, ME, 2026, '2026-10-07');
  await expect(page.getByTestId('tax-projected')).toHaveText(cardVnd(expected.projectedVnd));
  await expect(page.getByTestId('tax-vat')).toHaveText(cardVnd(0));
  await expect(page.getByTestId('tax-threshold-total')).toHaveCount(0);
  await expect(page.locator('[data-note="deduction_split"]')).toHaveCount(0);
});

test('rule 6: 2025 has no tax rule, so the card says so and shows no figure', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/reports/tax');
  await page.getByTestId('tax-years').getByRole('link', { name: '2025' }).click();
  await expect(page.getByTestId('tax-no-rule')).toHaveText('Chưa có quy tắc thuế cho năm 2025');
  await expect(page.getByTestId('tax-position')).toHaveCount(0);
  await expect(page.getByTestId('tax-vat')).toHaveCount(0);
  await expect(page.getByTestId('tax-pit')).toHaveCount(0);
  await shot(page, 'p4-04-no-rule-1440-dark');
});

test('rule 8: a lease row in the breakdown opens that lease', async ({ page }) => {
  await open(page, 'ryan.lane8@demo.esta.test', 'light', DESKTOP);
  await page.goto(`/reports/tax?owner=${seedId('seed:party:me-lane-8')}&year=2026`);
  await page.getByTestId('tax-lease').filter({ hasText: 'Dãy trọ Dĩ An, Phòng 3' }).click();
  await expect(page).toHaveURL(new RegExp(`${laneLeasePath(8, 'di-an', 3)}$`));
});

test('rule 10: in English at 130% the card reads in English with the same figures and nothing scrolls sideways', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    await page.goto('/reports/tax');
    const expected = await expectedTaxPosition(page, ME, 2026, '2026-10-07');
    await expect(page.getByRole('heading', { level: 1, name: 'Rental tax' })).toBeVisible();
    expect(await figure(page, 'tax-projected')).toBe(expected.projectedVnd);
    await expect(page.getByTestId('tax-progress')).toContainText('% of the');
    await expect(page.getByTestId('tax-disclaimer').first()).toContainText('Estimate, not tax advice');
    await page.getByTestId('tax-withheld').locator('summary').click();
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await clippedText(page)).toEqual([]);
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});
