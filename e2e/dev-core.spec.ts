import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './helpers/inbucket';

const NBSP = String.fromCharCode(160);
const SECTIONS = ['money', 'format', 'parse', 'statement', 'phone', 'names', 'search', 'address', 'vietqr', 'schedule', 'allocation', 'tax'];
const ESTA_INVOICE_PAYLOAD =
  '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045408150000005802VN62170813ESTA 7K2QX9MP6304BB90';
const NAPAS_6_3_3_PAYLOAD =
  '00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang63042E2E';

test.beforeEach(async ({ page }) => {
  await signIn(page, `dev-core.${randomUUID().slice(0, 8)}@demo.esta.test`);
});

test('/dev/core shows every core section with zero MISMATCH rows', async ({ page }) => {
  const response = await page.goto('/dev/core');
  expect(response?.status()).toBe(200);

  for (const id of SECTIONS) {
    await expect(page.locator(`section[data-section="${id}"] tbody tr`).first()).toBeVisible();
  }
  const results = page.locator('[data-cell="result"]');
  expect(await results.count()).toBeGreaterThan(40);
  await expect(results.filter({ hasText: 'MISMATCH' })).toHaveCount(0);
  await expect(page.getByTestId('core-summary')).toContainText(', 0 mismatches');

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('formatVnd separates the amount from ₫ with a no-break space', async ({ page }) => {
  await page.goto('/dev/core');
  const actual = page.locator('tr[data-fn="formatVnd"][data-input="15000000"][data-locale="vi"] [data-cell="actual"]');
  expect(await actual.textContent()).toBe(`15.000.000${NBSP}₫`);
});

test('the live box previews parsed amounts and names the reason for bad input', async ({ page }) => {
  await page.goto('/dev/core');
  const input = page.getByLabel('Amount as typed');
  const output = page.getByTestId('live-parse-output');

  await expect(output).toHaveText('rejected: empty');
  // A cold dev compile can hydrate after the first fill. React then keeps the typed text as its
  // tracked value, so refilling the same text fires no change; clear first on every retry.
  await expect(async () => {
    await input.fill('');
    await input.fill('3tr5');
    await expect(output).toHaveText(`3.500.000${NBSP}₫`, { timeout: 500 });
  }).toPass();

  for (const [text, shown] of [
    ['1ty2', `1.200.000.000${NBSP}₫`],
    ['850k', `850.000${NBSP}₫`],
    ['abc', 'rejected: invalid'],
  ] as const) {
    await input.fill(text);
    await expect(output).toHaveText(shown);
  }
});

test('the address section resolves the five FND-6 addresses', async ({ page }) => {
  await page.goto('/dev/core');
  const rows = page.locator('section[data-section="address"] tbody tr');
  await expect(rows).toHaveCount(7);
  await expect(rows.locator('[data-cell="result"]').filter({ hasText: 'MISMATCH' })).toHaveCount(0);
  await expect(page.locator('tr[data-input="Phường 2, Thành phố Tân An, Tỉnh Long An"] [data-cell="actual"]')).toHaveText(
    '27694 Phường Long An (80)',
  );
});

test('the VietQR section shows the invoice QR, reads it back from the canvas and re-encodes every vector', async ({ page }) => {
  await page.goto('/dev/core');
  const section = page.locator('section[data-section="vietqr"]');

  const canonical = section.getByTestId('vietqr-canonical');
  await expect(canonical).toHaveAttribute('data-payload', ESTA_INVOICE_PAYLOAD);
  await expect(canonical.locator('[data-field="amount"]')).toHaveText(`15.000.000${NBSP}₫`);
  await expect(canonical.locator('[data-field="purpose"]')).toHaveText('ESTA 7K2QX9MP');
  await expect(canonical.locator('[data-field="tag01"]')).toHaveText('12');
  await expect(canonical.locator('[data-field="accountName"]')).toHaveText('NGUYEN THI DEMO');
  await expect(section.getByTestId('vietqr-crc')).toHaveText('CRC khớp');
  await expect(section.getByTestId('vietqr-canonical-scan')).toHaveAttribute('data-match', 'match', { timeout: 10_000 });
  await expect(section.getByTestId('vietqr-canonical-scan')).toHaveText('Đọc lại từ ảnh: khớp');
  await expect(section.getByTestId('vietqr-overdue-scan')).toHaveAttribute('data-match', 'match', { timeout: 10_000 });

  const rows = section.locator('tbody tr');
  await expect(rows).toHaveCount(17);
  await expect(rows.filter({ has: page.locator('[data-cell="reencoded"]', { hasText: 'lệch' }) })).toHaveCount(0);
  await expect(section.locator('tr[data-match="match"]')).toHaveCount(7);

  const napas = section.locator('tr[data-example="napas-6.3.3-dynamic-account"]');
  await expect(napas.locator('[data-cell="payload"]')).toHaveText(NAPAS_6_3_3_PAYLOAD);
  await expect(napas.locator('[data-cell="reencoded"]')).toHaveText('khớp');

  await expect(section.locator('tr[data-example="no-amount"] [data-cell="tag01"]')).toHaveText('11');
  await expect(section.locator('tr[data-example="no-amount"] [data-cell="tag54"]')).toHaveText('không có');
  await expect(section.locator('tr[data-example="below-cap"] [data-cell="tag54"]')).toHaveText('499999999');
  for (const id of ['at-cap', 'above-cap']) {
    await expect(section.locator(`tr[data-example="${id}"] [data-cell="tag54"]`)).toHaveText('không có');
    await expect(section.locator(`tr[data-example="${id}"] [data-cell="tag01"]`)).toHaveText('11');
    await expect(section.locator(`tr[data-example="${id}"] [data-cell="decoded"]`)).toContainText('chia thành nhiều lần');
  }
  await expect(section.locator('tr[data-example="above-cap"] [data-cell="label"]')).toContainText(`600.000.000${NBSP}₫`);

  await expect(section.locator('tr[data-example="napas-6.3.1-static-account-as-printed"] [data-cell="decoded"]')).toContainText(
    'từ chối: tag 38.01: malformed TLV',
  );
  await expect(section.locator('tr[data-example="vietqr-vn-sample-bad-length"] [data-cell="decoded"]')).toContainText(
    'từ chối: CRC mismatch',
  );
  await expect(section.locator('tr[data-example="crc-pad"] [data-cell="payload"]')).toHaveText(/6304 ?0[0-9A-F]{3}$/);
  await expect(section.locator('tr[data-example="crc-pad"] [data-cell="reencoded"]')).toHaveText('khớp');
  await expect(section.locator('tr[data-example="long-purpose"] [data-cell="decoded"]')).toContainText('1..25');

  const { violations } = await new AxeBuilder({ page }).include('section[data-section="vietqr"]').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('the allocation section pays the oldest invoice first and matches every expected row', async ({ page }) => {
  await page.goto('/dev/core');
  const section = page.locator('section[data-section="allocation"]');
  const rows = section.locator('tbody tr');
  await expect(rows).toHaveCount(18);
  await expect(section.locator('tr[data-match="mismatch"]')).toHaveCount(0);
  await expect(rows.locator('[data-cell="result"]').filter({ hasText: 'lệch' })).toHaveCount(0);

  const oldestFirst = section.locator('tr[data-example="oldest-first"]');
  expect(await oldestFirst.locator('[data-cell="allocated"]').allTextContents()).toEqual([
    `3.500.000${NBSP}₫`,
    `1.500.000${NBSP}₫`,
    `0${NBSP}₫`,
  ]);
  expect(await oldestFirst.locator('[data-cell="status"]').allTextContents()).toEqual(['paid', 'partial', '']);
  await expect(section.locator('tr[data-example="override"]').last().locator('[data-cell="status"]')).toHaveText(
    'từ chối: override_exceeds_payment',
  );
  await expect(section.locator('tr[data-example="bien-hoa"]').last().locator('[data-cell="held"]')).toHaveText(`0${NBSP}₫`);

  const { violations } = await new AxeBuilder({ page }).include('section[data-section="allocation"]').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('the schedule section shows LSE-3 billed from October, the 25th anchor, an increase and a one-day last period', async ({ page }) => {
  await page.goto('/dev/core');
  const section = page.locator('section[data-section="schedule"]');
  await expect(section.locator('tbody tr')).toHaveCount(33);

  const lse3 = section.locator('tr[data-example="lse3"]');
  expect(await lse3.locator('[data-cell="period"]').allTextContents()).toEqual(['01/10/2026 – 31/10/2026', '01/11/2026 – 30/11/2026']);
  await expect(lse3.first().locator('[data-cell="due"]')).toHaveText('01/10/2026');
  expect(await section.locator('tr[data-example="phong-3"] [data-cell="period"]').allTextContents()).toEqual([
    '25/09/2026 – 24/10/2026',
    '25/10/2026 – 24/11/2026',
  ]);
  expect(await section.locator('tr[data-example="escalation"] [data-cell="amount"]').allTextContents()).toEqual([
    ...Array<string>(4).fill(`300.000.000${NBSP}₫`),
    ...Array<string>(4).fill(`315.000.000${NBSP}₫`),
    `330.900.000${NBSP}₫`,
  ]);
  const midEnd = section.locator('tr[data-example="mid-end"]').last();
  await expect(midEnd.locator('[data-cell="period"]')).toHaveText('01/11/2026 – 07/11/2026');
  await expect(midEnd.locator('[data-cell="note"]')).toHaveText('Tính theo ngày: 7/30 ngày');
  const thuDuc = section.locator('tr[data-example="thu-duc"]').last();
  await expect(thuDuc.locator('[data-cell="period"]')).toHaveText('01/11/2026 – 01/11/2026');
  await expect(thuDuc.locator('[data-cell="amount"]')).toHaveText(`300.000${NBSP}₫`);

  const { violations } = await new AxeBuilder({ page }).include('section[data-section="schedule"]').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('the live address box lists current wards for an old address', async ({ page }) => {
  await page.goto('/dev/core');
  const input = page.getByLabel('Old address');
  const output = page.getByTestId('address-lookup-output');
  const suggestions = page.getByTestId('address-suggestion');

  async function lookUp(text: string) {
    await expect(async () => {
      await input.fill('');
      await input.fill(text);
      await expect(output).toHaveAttribute('data-for', text, { timeout: 2_000 });
    }).toPass();
  }

  await lookUp('Dĩ An, Bình Dương');
  expect(await suggestions.evaluateAll((items) => items.map((item) => item.getAttribute('data-code')))).toEqual([
    '25942',
    '25945',
    '25951',
  ]);
  await expect(suggestions.first()).toHaveAttribute('data-province', '79');

  await lookUp('di an binh duong');
  await expect(suggestions).toHaveCount(3);

  await lookUp('Quận 7');
  await expect(suggestions).toHaveCount(4);
  await expect(suggestions.and(page.locator('[data-merge-kind="partial"]'))).toHaveCount(4);

  await lookUp('Phường 2, Thành phố Tân An, Tỉnh Long An');
  await expect(suggestions.first()).toHaveAttribute('data-code', '27694');
  await expect(suggestions.first().getByTestId('address-suggestion-source')).toContainText('curated');
  const { violations } = await new AxeBuilder({ page }).include('[data-testid="address-lookup"]').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await lookUp('Phường 1');
  await expect(output).toHaveText('No match');
});

test('the tax section reproduces E1 to E7 from the seeded tax_rules row', async ({ page }) => {
  await page.goto('/dev/core#tax');
  const section = page.locator('section[data-section="tax"]');
  const rows = section.locator('tbody tr');
  await expect(rows).toHaveCount(7);
  await expect(section.locator('tr[data-match="match"]')).toHaveCount(7);

  const e7 = section.locator('tr[data-example="E7"]');
  await expect(e7.locator('[data-cell="vat"]')).toHaveText(`22.500.000${NBSP}₫`);
  await expect(e7.locator('[data-cell="pit"]')).toHaveText(`0${NBSP}₫`);
  await expect(e7.locator('[data-cell="notes"]')).toContainText('hỏi kế toán về cách trừ 500 triệu');
  await expect(section.locator('tr[data-example="E6"] [data-cell="notes"]')).toContainText(`Bên thuê nộp thay: 200.000.000${NBSP}₫`);

  await expect(section.getByTestId('tax-source')).toHaveText(
    'Nguồn: Luật Thuế TNCN 109/2025/QH15; Luật sửa đổi Luật Thuế GTGT; Nghị định 68/2026/NĐ-CP',
  );
  await expect(section.getByTestId('tax-rule-note')).toContainText('Giả định: ');
});

test('?taxYear=2025 shows the no_rule state and keeps the examples on the 2026 rule', async ({ page }) => {
  await page.goto('/dev/core?taxYear=2025#tax');
  const section = page.locator('section[data-section="tax"]');
  await expect(section.getByTestId('tax-rule')).toHaveAttribute('data-state', 'no_rule');
  await expect(section.getByTestId('tax-no-rule')).toHaveText('Chưa có quy định thuế cho năm 2025');
  await expect(section.getByTestId('tax-source')).toHaveCount(0);
  await expect(section.locator('tr[data-match="match"]')).toHaveCount(7);
});
