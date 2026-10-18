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
const NBSP = ' ';
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const rentalPath = (lane: number, key: string) => `/properties/${propertyId(lane, key)}/rental`;
const EIGHT_ROOMS = Array.from({ length: 8 }, (_, index) => `Phòng ${index + 1}`);
const RENTS = ['2.500.000', '2.500.000', '2.500.000', '2.500.000', '2.800.000', '2.800.000', '2.800.000', '3.000.000'].map((amount) => `${amount}${NBSP}₫`);

// Each rule writes to its own lane household, so the spec runs at one project's viewport and sets the rule's own.
test.beforeEach(() => test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport'));

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

/** Puts a lane row back to its seed state first, so the rule passes again without a reset. */
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

const rows = (page: Page) => page.getByTestId('unit-row');
const labels = (page: Page) => page.getByTestId('unit-label');
const row = (page: Page, label: string) => rows(page).filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const noSideScroll = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);

async function expectRuleOne(page: Page, available: string) {
  await expect(labels(page)).toHaveText(EIGHT_ROOMS);
  await expect(rows(page).locator('data')).toHaveText(RENTS);
  await expect(row(page, 'Phòng 8').getByTestId('unit-available')).toHaveText(available);
  await expect(page.getByTestId('unit-available')).toHaveCount(1);
}

test('rule 1: Cho thuê on Dãy trọ Dĩ An lists Phòng 1 to Phòng 8 with list rents, and Phòng 8 is free from 01/08/2026 (PRP-1)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${propertyId(1, 'di-an')}`);
  await page.getByRole('link', { name: 'Cho thuê', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${rentalPath(1, 'di-an')}$`));
  await expectRuleOne(page, 'Có thể cho thuê từ 01/08/2026');
  await expect(page.getByTestId('rental-total')).toHaveText(`Giá niêm yết mỗi tháng 21.400.000${NBSP}₫`);
  await expect(page.getByTestId('room-count-mismatch')).toHaveCount(0);
  await expect(page.getByTestId('account-row')).toHaveCount(2);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: adding a room at 2tr8 with a double tap on save makes exactly one Phòng 9 and flags the declared count', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'dark', PHONE);
  const seeded = encodeURIComponent(`(${EIGHT_ROOMS.map((label) => `"${label}"`).join(',')})`);
  await rest(page, 'DELETE', `units?property_id=eq.${propertyId(2, 'di-an')}&label=not.in.${seeded}`);
  await page.goto(rentalPath(2, 'di-an'));
  await expect(labels(page)).toHaveText(EIGHT_ROOMS);

  await page.getByTestId('add-rooms').click();
  const sheet = page.getByTestId('add-rooms-sheet');
  await expect(sheet.getByTestId('room-labels')).toHaveText('Sẽ thêm Phòng 9');
  await sheet.getByRole('textbox', { name: 'Giá niêm yết mỗi phòng' }).fill('2tr8');
  await expect(sheet.getByTestId('money-preview')).toHaveText(`2.800.000${NBSP}₫`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  const posts: string[] = [];
  page.on('request', (request) => (request.method() === 'POST' ? posts.push(request.url()) : null));
  await sheet.getByTestId('save-rooms').dblclick();
  await expect(sheet).toHaveCount(0);

  await page.reload();
  await expect(labels(page)).toHaveText([...EIGHT_ROOMS, 'Phòng 9']);
  await expect(row(page, 'Phòng 9').locator('data')).toHaveText(`2.800.000${NBSP}₫`);
  await expect(page.getByTestId('room-count-mismatch')).toHaveText('Theo khai báo 8 phòng, đã nhập 9 phòng.');
  expect(posts.length, 'the save posted at least once').toBeGreaterThan(0);
});

test('rule 3: an electricity account on Phòng 2 lists under Phòng 2 and a water account under the property', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'light', DESKTOP);
  await rest(page, 'DELETE', `utility_accounts?property_id=eq.${propertyId(3, 'di-an')}&customer_code=in.(PE0123456789,NB0123456789)`);
  await page.goto(rentalPath(3, 'di-an'));

  await page.getByTestId('add-account').click();
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.locator('#account-kind').selectOption({ label: 'Điện' });
  await page.getByTestId('account-unit').selectOption({ label: 'Phòng 2' });
  await page.locator('#account-provider').fill('Điện lực Demo Dĩ An');
  await page.locator('#account-code').fill('PE0123456789');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('save-account').click();
  await expect(page).toHaveURL(new RegExp(`${rentalPath(3, 'di-an')}$`));

  await page.getByTestId('add-account').click();
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.locator('#account-kind').selectOption({ label: 'Nước' });
  await page.locator('#account-provider').fill('Cấp nước Demo Bình Dương');
  await page.locator('#account-code').fill('NB0123456789');
  await page.getByTestId('save-account').click();
  await expect(page).toHaveURL(new RegExp(`${rentalPath(3, 'di-an')}$`));

  const group = (title: string) => page.getByTestId('account-group').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const room2 = group('Phòng 2').getByTestId('account-row');
  await expect(room2).toHaveCount(1);
  await expect(room2).toContainText('Điện · Điện lực Demo Dĩ An');
  await expect(room2.getByTestId('customer-code')).toHaveText('PE0123456789');
  const water = group('Cả tài sản').getByTestId('account-row').filter({ hasText: 'NB0123456789' });
  await expect(water).toContainText('Nước · Cấp nước Demo Bình Dương');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 4: Tài sản sorted by Giá thuê leads with Mặt bằng Quận 1 at 30 tr and leaves the land without rent last (PRP-8)', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/properties');
  await page.getByRole('combobox', { name: /^Sắp xếp/ }).selectOption({ label: 'Giá thuê' });
  await expect(page).toHaveURL(/[?&]sort=rent/);
  const cards = page.getByTestId('property-card');
  await expect(cards.getByRole('heading', { level: 2 })).toHaveText([
    'Mặt bằng Quận 1',
    'Dãy trọ Dĩ An',
    'Nhà phố Q7',
    'Căn hộ Thủ Đức',
    'Đất Bảo Lộc',
    'Đất vườn Long An',
    'Kho Biên Hòa',
  ]);
  // Since P3-07 the card shows the rent of active leases; Kho Biên Hòa's last lease ended on 2026-07-29.
  const rent = 'Tiền thuê mỗi tháng';
  await expect(cards.getByTestId('property-rent')).toHaveText([`${rent}30 tr`, `${rent}15,6 tr`, `${rent}15 tr`, `${rent}9 tr`]);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: a new rooming house starts with Toàn bộ, and adding 4 rooms leaves Phòng 1 to Phòng 4 alone', async ({ page }) => {
  const nickname = 'Dãy trọ Demo Thủ Dầu Một';
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await rest(page, 'PATCH', `properties?nickname=eq.${encodeURIComponent(nickname)}&deleted_at=is.null`, { deleted_at: '2026-10-07T02:00:00Z' });
  await page.goto('/properties/new');
  await page.getByTestId('nickname').fill(nickname);
  await page.getByTestId('kind-select').selectOption({ label: 'Dãy trọ' });
  await page.getByTestId('save-property').click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = /\/properties\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? '';
  try {
    await page.getByRole('link', { name: 'Cho thuê', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${id}/rental$`));
    await expect(labels(page)).toHaveText(['Toàn bộ']);
    await expect(rows(page).getByRole('button', { name: /^Xóa/ })).toHaveCount(0);

    await page.getByTestId('add-rooms').click();
    const sheet = page.getByTestId('add-rooms-sheet');
    await sheet.locator('#room-count').fill('4');
    await expect(sheet.getByTestId('room-labels')).toHaveText('Sẽ thêm Phòng 1, Phòng 2, Phòng 3, Phòng 4');
    await sheet.getByTestId('save-rooms').click();
    await expect(sheet).toHaveCount(0);
    await expect(labels(page)).toHaveText(['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 4']);
    await page.reload();
    await expect(labels(page)).toHaveText(['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 4']);
  } finally {
    await rest(page, 'PATCH', `properties?id=eq.${id}`, { deleted_at: '2026-10-07T02:00:00Z' });
  }
});

test('rule 6: in English at 130% and dark the tab translates, room labels stay Vietnamese and nothing scrolls sideways', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);

  await page.goto(`/properties/${propertyId(10, 'di-an')}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('link', { name: 'Rental', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Units for rent' })).toBeVisible();
  await expect(rows(page).locator('data')).toHaveText(RENTS.map((amount) => amount.replaceAll('.', ',')));
  await expect(labels(page)).toHaveText(EIGHT_ROOMS);
  await expect(row(page, 'Phòng 8').getByTestId('unit-available')).toHaveText('Available from 01/08/2026');
  await expect(row(page, 'Phòng 1').getByRole('button', { name: 'Move Phòng 1 down' })).toBeVisible();
  expect(await noSideScroll(page), 'no horizontal page scroll').toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 7: the Dĩ An card and header show the open square with Trống từ 01/08, and only Kho Biên Hòa, empty since its lease ended, also shows Trống', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto('/properties');
  const cards = page.getByTestId('property-card');
  const marks = cards.locator('[data-status="vacant"]');
  await expect(marks).toHaveText(['Trống từ 01/08', 'Trống từ 30/07']);
  const diAn = cards.filter({ has: page.getByRole('heading', { name: 'Dãy trọ Dĩ An', exact: true }) });
  const cardMark = diAn.locator('[data-status="vacant"]');
  await expect(cardMark).toHaveText('Trống từ 01/08');
  await expect(cardMark.locator('svg[data-shape="vacant"]')).toBeVisible();
  await expect(cardMark).toHaveClass(/\btext-vacant\b/);
  await expect(cards.filter({ hasText: 'Trống' })).toHaveCount(2);

  await diAn.getByRole('link', { name: 'Dãy trọ Dĩ An' }).click();
  const headerMark = page.getByTestId('property-header').locator('[data-status="vacant"]');
  await expect(headerMark).toHaveText('Trống từ 01/08');
  await expect(headerMark.locator('svg[data-shape="vacant"]')).toBeVisible();
  await expect(headerMark).toHaveClass(/\bbg-vacant-fill\b/);
});

test('deleting Phòng 8 and tapping Hoàn tác brings it back with its available date', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'light', PHONE);
  await page.goto(rentalPath(9, 'di-an'));
  await expectRuleOne(page, 'Có thể cho thuê từ 01/08/2026');

  await row(page, 'Phòng 8').getByRole('button', { name: 'Sửa Phòng 8' }).click();
  const sheet = page.getByTestId('unit-sheet');
  await expect(sheet.getByRole('heading', { name: 'Sửa Phòng 8' })).toBeVisible();
  await sheet.getByTestId('delete-unit').click();
  await expect(labels(page)).toHaveText(EIGHT_ROOMS.slice(0, 7));
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expectRuleOne(page, 'Có thể cho thuê từ 01/08/2026');
  await page.reload();
  await expectRuleOne(page, 'Có thể cho thuê từ 01/08/2026');
});

test('the edit sheet changes a list rent and Lên moves a room up, and both hold after a reload', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  const id = propertyId(8, 'di-an');
  const room = (n: number) => seedId(`seed:unit:lane-8:di-an:${n}`);
  await rest(page, 'PATCH', `units?id=eq.${room(3)}`, { list_rent_vnd: 2_500_000, sort_order: 2 });
  await rest(page, 'PATCH', `units?id=eq.${room(2)}`, { sort_order: 1 });
  await page.goto(`/properties/${id}/rental`);
  await expect(labels(page)).toHaveText(EIGHT_ROOMS);

  await row(page, 'Phòng 3').getByRole('button', { name: 'Đưa Phòng 3 lên' }).click();
  await expect(labels(page).nth(1)).toHaveText('Phòng 3');
  await row(page, 'Phòng 3').getByRole('button', { name: 'Sửa Phòng 3' }).click();
  const sheet = page.getByTestId('unit-sheet');
  await sheet.getByRole('textbox', { name: 'Giá niêm yết mỗi tháng' }).fill('2tr6');
  await sheet.getByTestId('save-unit').click();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(labels(page)).toHaveText(['Phòng 1', 'Phòng 3', 'Phòng 2', ...EIGHT_ROOMS.slice(3)]);
  await expect(row(page, 'Phòng 3').locator('data')).toHaveText(`2.600.000${NBSP}₫`);
  await rest(page, 'PATCH', `units?id=eq.${room(3)}`, { list_rent_vnd: 2_500_000, sort_order: 2 });
  await rest(page, 'PATCH', `units?id=eq.${room(2)}`, { sort_order: 1 });
});
