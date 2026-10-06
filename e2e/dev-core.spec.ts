import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const NBSP = String.fromCharCode(160);
const SECTIONS = ['money', 'format', 'parse', 'statement', 'phone', 'names', 'search'];

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
  for (const [text, shown] of [
    ['3tr5', `3.500.000${NBSP}₫`],
    ['1ty2', `1.200.000.000${NBSP}₫`],
    ['850k', `850.000${NBSP}₫`],
    ['abc', 'rejected: invalid'],
  ] as const) {
    await input.fill(text);
    await expect(output).toHaveText(shown);
  }
});
