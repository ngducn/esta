import { expect, test } from '@playwright/test';
import { addBulkProperties } from '../scripts/perf/bulk-rows.ts';
import { memberRest } from './helpers/auth-api';
import { openNewHousehold, PHONE } from './helpers/wizard';

const ROW_CAP = 100;

// The rows go to a household of their own: a seeded lane household is read by other specs, and 1,000 unvalued
// properties would break the one that expects Home to count none.
test('the 1,000-row property list renders under 100 rows, scrolls, and searches', async ({ page }) => {
  test.slow();
  await openNewHousehold(page, 'light', PHONE);
  const [household] = await memberRest<{ id: string }[]>(page, 'GET', 'households?select=id');
  if (household === undefined) throw new Error('The new member has no household');
  await addBulkProperties(household.id);
  await page.goto('/properties');
  const cards = page.locator('[data-testid="virtual-property-list"] li');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(ROW_CAP);
  for (const fraction of [0.25, 0.5, 1]) {
    await page.evaluate((to) => window.scrollTo(0, document.documentElement.scrollHeight * to), fraction);
    await page.waitForTimeout(200);
    expect(await cards.count(), `after scrolling to ${fraction}`).toBeLessThan(ROW_CAP);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('searchbox').fill('demo bulk 0999');
  await expect(page.getByText('Demo bulk 0999')).toBeVisible();
  expect(await cards.count()).toBeLessThan(ROW_CAP);
});
