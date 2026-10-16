import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

async function setLocaleCookie(page: Page, baseURL: string | undefined, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, url: baseURL ?? '' }]);
}

test('/sign-in renders Vietnamese by default', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đăng nhập');
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page).toHaveTitle('Đăng nhập');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('/sign-in renders English with the NEXT_LOCALE=en cookie', async ({ page, baseURL }) => {
  await setLocaleCookie(page, baseURL, 'en');
  await page.goto('/sign-in');
  await expect(page.getByText("The family's property ledger")).toBeVisible();
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('/sign-in falls back to Vietnamese for an unknown NEXT_LOCALE value', async ({ page, baseURL }) => {
  await setLocaleCookie(page, baseURL, 'fr');
  await page.goto('/sign-in');
  await expect(page.getByText('Sổ cái nhà đất của gia đình')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

test('the server HTML is already in the cookie locale', async ({ request }) => {
  const response = await request.get('/sign-in', { headers: { cookie: 'NEXT_LOCALE=en' } });
  const html = (await response.text()).replaceAll('&#x27;', "'");
  expect(html).toContain('<html lang="en"');
  expect(html).toContain(">The family's property ledger</p>");
  expect(html).toContain(`<meta name="description" content="The family's property ledger"/>`);
  expect(html).not.toContain('Sổ cái nhà đất của gia đình');
});

test('client components read the app messages in the request locale', async ({ page, baseURL }) => {
  await page.goto('/dev/i18n');
  await expect(page.getByTestId('client-tagline')).toHaveText('Sổ cái nhà đất của gia đình');
  await setLocaleCookie(page, baseURL, 'en');
  await page.reload();
  await expect(page.getByTestId('client-tagline')).toHaveText("The family's property ledger");
});
