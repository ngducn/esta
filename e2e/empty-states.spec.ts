import { expect, test, type Page } from '@playwright/test';
import { EMPTY_STATES, type EmptySurface } from '../apps/web/src/app/empty-states';
import { signIn } from './helpers/inbucket';
import { onlyOn } from './helpers/shell';
import { openNewHousehold, PHONE, seriousAxeViolations, startWizard } from './helpers/wizard';

const UNREACHABLE: Partial<Record<EmptySurface, string>> = {
  propertyActivity: 'a property always has its creation entry',
  leaseDocuments: 'a new household has no lease',
  settingsHistory: 'the change history is for the operator',
};

const REPORT_SURFACE = {
  pnl: 'reportsPnl',
  owners: 'reportsOwners',
  'rent-roll': 'reportsRentRoll',
  collections: 'reportsCollections',
  occupancy: 'reportsOccupancy',
  portfolio: 'reportsPortfolio',
} as const;

async function expectOneMessageAndOneAction(page: Page, route: string, surfaces: readonly EmptySurface[], visited: Set<string>) {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="empty-state"]'), `${route} shows one empty state per surface it names`).toHaveCount(surfaces.length);
  for (const surface of surfaces) {
    const box = page.locator(`main [data-surface="${surface}"]`);
    await expect(box, `${route} shows ${surface} once`).toHaveCount(1);
    await expect(box.getByRole('heading', { level: 2 }), `${surface} has one message`).toHaveCount(1);
    await expect(box.locator('a, button'), `${surface} has exactly one action`).toHaveCount(1);
    visited.add(surface);
  }
}

test('a new household sees one message and one action on every empty screen', async ({ page }) => {
  onlyOn('mobile');
  test.setTimeout(300_000);
  const visited = new Set<string>();
  let routes = 0;
  const check = async (route: string, surfaces: readonly EmptySurface[]) => {
    await expectOneMessageAndOneAction(page, route, surfaces, visited);
    routes += 1;
  };
  await openNewHousehold(page, 'light', PHONE);

  await check('/', ['home']);
  await check('/properties', ['properties']);
  await check('/properties/archived', ['propertiesArchived']);
  await check('/collections', ['collections']);
  await check('/collections/import', ['statementImport']);
  await check('/documents', ['documents']);
  await check('/assistant', ['assistantThread']);
  await check('/assistant/market', ['assistantMarket']);
  await check('/settings', ['settingsAccounts']);
  for (const [report, surface] of Object.entries(REPORT_SURFACE)) await check(`/reports?report=${report}`, [surface]);
  expect(await seriousAxeViolations(page)).toEqual([]);

  const { propertyId } = await startWizard(page, { nickname: 'Nhà Demo Rỗng', kind: 'townhouse', photo: null });
  const property = `/properties/${propertyId}`;
  await check(`${property}/legal`, ['propertyLegalCertificates', 'propertyLegalParcels', 'propertyLegalStructures']);
  await check(`${property}/rental`, ['propertyRentalAccounts']);
  await check(`${property}/rental/meters`, ['propertyMeters']);
  await check(`${property}/documents`, ['propertyDocuments']);
  expect(await seriousAxeViolations(page)).toEqual([]);

  const missing = Object.keys(EMPTY_STATES).filter((surface) => !visited.has(surface) && !(surface in UNREACHABLE));
  expect(missing, 'every registered surface is visited, or named as unreachable above').toEqual([]);
  console.log(`empty-states: ${routes} routes checked, ${visited.size} surfaces`);
});

const FAILING = [
  { route: '/properties', title: 'Chưa tải được thông tin tài sản', surface: 'properties' },
  { route: '/collections', title: 'Chưa tải được bảng thu tiền', surface: 'collections' },
  { route: '/documents', title: 'Chưa tải được tài liệu', surface: 'documents' },
  { route: '/assistant', title: 'Chưa tải được', surface: 'assistantThread' },
  { route: '/reports', title: 'Chưa tải được', surface: 'reportsPnl' },
  { route: '/settings', title: 'Chưa tải được', surface: 'settingsAccounts' },
] as const;

test('a failed load says so with a retry, never the empty message', async ({ page, baseURL }) => {
  onlyOn('mobile');
  test.setTimeout(240_000);
  await openNewHousehold(page, 'light', PHONE);
  const fault = { name: 'esta_fault', value: 'reads', url: baseURL ?? '' };
  for (const { route, title, surface } of FAILING) {
    await page.context().addCookies([fault]);
    await page.goto(route);
    const alert = page.getByRole('alert').filter({ hasText: title });
    await expect(alert, `${route} could not load`).toBeVisible({ timeout: 30_000 });
    await expect(alert.getByRole('button', { name: 'Thử lại' })).toBeVisible();
    await expect(page.locator('[data-slot="empty-state"]'), `${route} does not look empty`).toHaveCount(0);
    if (route === '/documents') expect(await seriousAxeViolations(page)).toEqual([]);
    await page.context().clearCookies({ name: 'esta_fault' });
    await alert.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.locator(`[data-surface="${surface}"]`), `${route} loads again after the retry`).toBeVisible({ timeout: 30_000 });
  }
});

test('a document that cannot be read is not reported missing', async ({ page, baseURL }) => {
  onlyOn('mobile');
  await signIn(page, 'me.lane2@demo.esta.test');
  await page.goto('/documents');
  const first = page.locator('a[href^="/documents/"]').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  const href = await first.getAttribute('href');
  await page.context().addCookies([{ name: 'esta_fault', value: 'reads', url: baseURL ?? '' }]);
  await page.goto(href ?? '/documents');
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa tải được' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('not-found')).toHaveCount(0);
  await page.goto(`${href}/review`);
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa tải được' })).toBeVisible({ timeout: 30_000 });
});

test("an unknown address shows the app's own page with a way back", async ({ page }) => {
  onlyOn('mobile');
  await openNewHousehold(page, 'light', PHONE);
  const response = await page.goto('/khong-co-trang-nay');
  expect(response?.status()).toBe(404);
  const box = page.getByTestId('not-found');
  await expect(box.getByRole('heading', { level: 2 })).toHaveText('Không tìm thấy trang này');
  await expect(box.getByRole('link', { name: 'Về Tổng quan' })).toHaveAttribute('href', '/');
  expect(await seriousAxeViolations(page)).toEqual([]);
});
