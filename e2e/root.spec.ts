import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test('/ shows the Esta placeholder in Vietnamese', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('body')).toHaveText('Esta');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('/dev serves the dev index outside production', async ({ page }) => {
  const response = await page.goto('/dev');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dev pages');
  expect(await seriousAxeViolations(page)).toEqual([]);
});
