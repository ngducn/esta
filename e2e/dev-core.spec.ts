import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './helpers/inbucket';

const NBSP = String.fromCharCode(160);
const SECTIONS = ['money', 'format', 'parse', 'statement', 'phone', 'names', 'search', 'address'];

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
