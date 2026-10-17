import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const legalPath = (lane: number, key: string) => `/properties/${propertyId(lane, key)}/legal`;

// Each rule writes to its own lane household, so the spec runs at one project's viewport and sets the rule's own.
const onlyOnMobile = () => test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport');

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

/** Puts a lane row back to its seed values first, so the rule passes again without a reset. */
async function rest(page: Page, method: 'PATCH' | 'DELETE', path: string, data?: Record<string, unknown>) {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const parcels = (page: Page) => page.getByTestId('parcels-card');

test.beforeEach(onlyOnMobile);

test('rule 1: Mẹ adds parcel 412 to Đất Bảo Lộc and the land area adds up to 500,5 m²', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await rest(page, 'DELETE', `parcels?property_id=eq.${propertyId(1, 'bao-loc')}&parcel_no=eq.412`);
  await page.goto(legalPath(1, 'bao-loc'));
  await expect(parcels(page)).toHaveCount(1);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByRole('link', { name: 'Thêm thửa đất' }).click();
  await page.locator('#parcel-no').fill('412');
  await page.locator('#map-sheet-no').fill('18');
  await page.locator('#parcel-area').fill('350,5');
  await page.getByTestId('add-purpose').click();
  await page.getByTestId('purpose-code').fill('cln');
  await expect(page.getByTestId('purpose-code-name')).toHaveText('Đất trồng cây lâu năm');
  await page.getByTestId('purpose-area').fill('350,5');
  await expect(page.getByTestId('purposes-mismatch')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('save-legal-item').click();
  await expect(page).toHaveURL(new RegExp(`${legalPath(1, 'bao-loc')}$`));

  await page.reload();
  await expect(parcels(page)).toHaveCount(2);
  await expect(page.getByTestId('land-area-total')).toHaveText('Tổng diện tích đất 500,5 m²');
  await expect(parcels(page).filter({ hasText: 'Thửa số 412' }).getByTestId('purpose')).toContainText(['CLN']);
});

test('rule 2: Ryan finds Đất Bảo Lộc by typing bao loc and reads its mortgaged certificate', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/properties');
  await page.getByRole('searchbox').fill('bao loc');
  await expect(page).toHaveURL(/\?q=bao\+loc$/);
  await page.getByTestId('property-card').getByRole('link', { name: 'Đất Bảo Lộc', exact: true }).click();
  await page.getByRole('navigation', { name: 'Các mục của tài sản' }).getByRole('link', { name: 'Pháp lý' }).click();
  await expect(page).toHaveURL(new RegExp(`${legalPath(2, 'bao-loc')}$`));
  await expect(page.getByTestId('certificate-status')).toHaveText('Đang thế chấp');
  await expect(page.getByTestId('certificate-mortgage')).toContainText('Ngân hàng Demo');
  await expect(page.getByTestId('certificate-mortgage')).toContainText(/2\.000\.000\.000\s₫/);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 3: Mẹ adds CLN and an unknown XYZ to the Q7 parcel and the mismatch keeps both totals', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  const parcel = seedId('seed:parcel:lane-3:q7:1');
  await rest(page, 'PATCH', `parcels?id=eq.${parcel}`, { purposes: [{ land_use_code: 'ODT', area_m2: 80, term: 'long_term' }] });
  await page.goto(`${legalPath(3, 'q7')}/parcels/${parcel}`);
  for (const [code, area] of [
    ['CLN', '20,5'],
    ['XYZ', '10'],
  ] as const) {
    await page.getByTestId('add-purpose').click();
    await page.getByTestId('purpose-code').last().fill(code);
    await page.getByTestId('purpose-area').last().fill(area);
  }
  await expect(page.getByTestId('purpose-code-name')).toHaveText(['Đất ở tại đô thị', 'Đất trồng cây lâu năm', 'mã chưa có trong danh mục']);
  await expect(page.getByTestId('purposes-mismatch')).toContainText('110,5 m²');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('save-legal-item').click();
  await expect(page).toHaveURL(new RegExp(`${legalPath(3, 'q7')}$`));

  await page.reload();
  const card = parcels(page);
  await expect(card.locator('[data-code="CLN"]')).toContainText('Đất trồng cây lâu năm');
  await expect(card.locator('[data-code="XYZ"]')).toContainText('mã chưa có trong danh mục');
  await expect(card.getByTestId('purposes-mismatch')).toContainText('110,5 m²');
  await expect(card.getByTestId('purposes-mismatch')).toContainText('80 m²');
});

test('rule 4: Ryan mortgages the Kho Biên Hòa certificate for 1ty2 and quick-adds a holder', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  const certificate = seedId('seed:certificate:lane-4:bien-hoa');
  await rest(page, 'PATCH', `certificates?id=eq.${certificate}`, {
    status: 'valid',
    mortgage: null,
    holder_party_ids: [seedId('seed:party:me-lane-4'), seedId('seed:party:ryan-lane-4')],
  });
  await page.goto(`${legalPath(4, 'bien-hoa')}/certificates/${certificate}`);
  await page.getByTestId('certificate-status-select').selectOption('mortgaged');
  await page.getByTestId('bank-select').selectOption({ label: 'Ngân hàng Demo' });
  await page.getByTestId('mortgage-fields').getByLabel('Số tiền thế chấp').fill('1ty2');
  await expect(page.getByTestId('money-preview')).toHaveText(/^1\.200\.000\.000\s₫$/);
  await page.getByTestId('add-holder').click();
  await page.getByTestId('quick-add-name').fill('Lê Văn Demo');
  await page.getByTestId('quick-add-last4').fill('1234');
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByTestId('holders')).toContainText('Lê Văn Demo');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('save-legal-item').click();
  await expect(page).toHaveURL(new RegExp(`${legalPath(4, 'bien-hoa')}$`));

  await page.reload();
  await expect(page.getByTestId('certificate-status')).toHaveText('Đang thế chấp');
  await expect(page.getByTestId('certificate-holders')).toContainText('Lê Văn Demo');
});

test('rule 5: Mẹ deletes the Q7 structure and Hoàn tác brings it back', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto(legalPath(5, 'q7'));
  const structure = page.getByTestId('structures-card');
  await expect(structure).toHaveCount(1);
  await structure.getByTestId('delete-legal-item').click();
  const toast = page.getByRole('region', { name: 'Thông báo' });
  await expect(toast).toContainText('Đã xóa Nhà ở riêng lẻ.');
  await expect(structure).toHaveCount(0);
  await toast.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(structure).toHaveCount(1);

  await page.reload();
  await expect(structure).toHaveCount(1);
  await expect(structure).toContainText('Nhà ở riêng lẻ');
});

test('rule 6: in English at 130% and dark, Pháp lý reads in English and does not scroll sideways', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'en', text_scale: 130 });
  try {
    await page.goto(legalPath(10, 'bao-loc'));
    await expect(page.getByRole('heading', { level: 2, name: 'Certificates' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Land parcels' })).toBeVisible();
    await expect(page.getByTestId('certificate-status')).toHaveText('Mortgaged');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đất Bảo Lộc');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'vi', text_scale: 100 });
  }
});

test('Đất vườn Long An shows a paper-only certificate and one parcel with no number and no area', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'light', PHONE);
  await page.goto(legalPath(6, 'long-an'));
  await expect(page.getByTestId('legal-certificates').getByRole('heading', { level: 3 })).toHaveText('Giấy tay, chưa có sổ');
  await expect(parcels(page)).toHaveCount(1);
  await expect(parcels(page).getByRole('heading', { level: 3 })).toHaveText('Thửa chưa có số');
  await expect(parcels(page).getByTestId('parcel-area')).toHaveText('Chưa có diện tích');
});

test('a bad kind or item id is not found, and the tab renders its empty states', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'light', PHONE);
  for (const path of ['owners/new', 'parcels/12', `parcels/${seedId('seed:parcel:lane-8:q7:1')}`]) {
    await page.goto(`${legalPath(7, 'q7')}/${path}`);
    await expect(page.getByTestId('property-not-found'), path).toBeVisible();
  }
  await page.goto(legalPath(7, 'bao-loc'));
  await expect(page.getByTestId('legal-structures')).toContainText('Chưa ghi nhà hay công trình');
  await expect(page.getByTestId('legal-structures').getByRole('link', { name: 'Thêm nhà, công trình' })).toBeVisible();
});
