import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

async function setLocaleCookie(page: Page, baseURL: string | undefined, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, url: baseURL ?? '' }]);
}

test('/ renders Vietnamese by default', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Esta');
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page).toHaveTitle('Esta');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('/ renders English with the NEXT_LOCALE=en cookie', async ({ page, baseURL }) => {
  await setLocaleCookie(page, baseURL, 'en');
  await page.goto('/');
  await expect(page.getByText("The family's property ledger")).toBeVisible();
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('/ falls back to Vietnamese for an unknown NEXT_LOCALE value', async ({ page, baseURL }) => {
  await setLocaleCookie(page, baseURL, 'fr');
  await page.goto('/');
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

test('the server HTML is already in the cookie locale', async ({ request }) => {
  const response = await request.get('/', { headers: { cookie: 'NEXT_LOCALE=en' } });
  const html = (await response.text()).replaceAll('&#x27;', "'");
  expect(html).toContain('<html lang="en"');
  expect(html).toContain("The family's property ledger");
  expect(html).not.toContain('Sổ cái nhà đất của gia đình');
});
