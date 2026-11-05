import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { watchViolations } from './helpers/csp';
import { signIn } from './helpers/inbucket';
import { laneInvoice, laneProperty } from './helpers/seed';
import { stubTiles } from './helpers/map-tiles';

const BAO_LOC_CERTIFICATE = seedId('seed:document:lane-1:bao-loc:certificate');
const BIEN_HOA = seedId('seed:property:lane-3:bien-hoa');

/** Opens each path once it has rendered and settled, and fails on the first that raised a violation. */
async function visitWithoutViolations(page: Page, violations: readonly string[], paths: readonly string[]) {
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(violations, path).toEqual([]);
  }
}

test('Home, Thu tiền, a property map, the assistant and a signed document raise no CSP violation', async ({ page }) => {
  test.slow();
  await stubTiles(page);
  const violations = await watchViolations(page);
  await signIn(page, 'ryan.lane3@demo.esta.test');
  await visitWithoutViolations(page, violations, ['/', '/collections', '/properties', '/properties?view=map', `/properties/${BIEN_HOA}`, '/assistant']);
  await page.goto('/properties?view=map');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations, 'the map and its worker').toEqual([]);
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

test('Tài liệu, a property’s documents tab and capture flow, a new property, a bill with its VietQR and receipt, Cài đặt and the statement import raise no CSP violation', async ({ page }) => {
  test.slow();
  const violations = await watchViolations(page);
  await signIn(page, 'me.lane1@demo.esta.test');
  const bill = laneInvoice(1, 'di-an', 3, '2026-10-25');
  await visitWithoutViolations(page, violations, ['/documents', `/properties/${laneProperty(1, 'bao-loc')}/documents`, '/properties/new', '/settings', '/collections/import', `/collections/invoices/${bill}`]);
  await expect(page.getByTestId('invoice-qr').getByTestId('qr-code')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('receipt-png').click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const pdf = await page.request.get(`/api/invoices/${bill}/receipt?format=pdf`);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect(pdf.headers()['content-security-policy']).toContain("object-src 'none'");

  await page.goto(`/properties/${laneProperty(1, 'bao-loc')}/documents`);
  await expect(page.getByTestId('add-document'), 'React owns the page').toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('add-document').click();
  await page.getByTestId('capture-pages').click();
  await expect(page.getByTestId('multi-page-capture')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations, 'the capture flow').toEqual([]);
});
