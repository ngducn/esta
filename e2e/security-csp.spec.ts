import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { stubTiles } from './helpers/map-tiles';

const BAO_LOC_CERTIFICATE = seedId('seed:document:lane-1:bao-loc:certificate');
const BIEN_HOA = seedId('seed:property:lane-3:bien-hoa');

/** Every `securitypolicyviolation` the page raises, across navigations, as "directive blocked-url". */
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('reportViolation', (what: string) => violations.push(what));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      void (window as unknown as { reportViolation(what: string): void }).reportViolation(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  return violations;
}

test('Home, Thu tiền, a property map, the assistant and a signed document raise no CSP violation', async ({ page }) => {
  test.slow();
  await stubTiles(page);
  const violations = await watchViolations(page);
  await signIn(page, 'ryan.lane3@demo.esta.test');
  for (const path of ['/', '/collections', '/properties', '/properties?view=map', `/properties/${BIEN_HOA}`, '/assistant']) {
    await page.goto(path);
    await expect(page.getByRole('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(violations, path).toEqual([]);
  }
  await page.goto('/properties?view=map');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations, 'the map and its blob worker').toEqual([]);
});

test('a signed document image loads under the CSP', async ({ page }) => {
  const violations = await watchViolations(page);
  await signIn(page, 'me.lane1@demo.esta.test');
  await page.goto(`/documents/${BAO_LOC_CERTIFICATE}`);
  const image = page.locator('main img[src*="/storage/v1/object/sign/"]').first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(violations).toEqual([]);
});
