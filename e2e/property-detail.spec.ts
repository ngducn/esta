import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { stubTiles } from './helpers/map-tiles';
import { accessToken } from './helpers/session';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/property-photos\//;
const LONG_LINK = 'https://www.google.com/maps/place/Demo+Long+An/@10.6,106.3,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d10.5331!4d106.4052';

const MAPLIBRE_BODY = 'maplibregl-canvas';
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function setClock(request: APIRequestContext, frozenNow: string | null) {
  const headers = { authorization: `Bearer ${slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false }).CRON_SECRET}` };
  const response =
    frozenNow === null ? await request.delete('/api/test/clock', { headers }) : await request.post('/api/test/clock', { headers, data: { frozen_now: frozenNow } });
  expect(response.ok()).toBe(true);
}

async function setLocation(page: Page, id: string, location: { lat: number; lng: number } | null) {
  const response = await page.request.post(`${supabaseUrl}/rest/v1/rpc/set_property_location`, {
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}` },
    data: { p_property_id: id, ...(location === null ? {} : { p_lat: location.lat, p_lng: location.lng }) },
  });
  expect(response.ok()).toBe(true);
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function open(page: Page, email: string, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
  await page.goto('/properties');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function tapCard(page: Page, nickname: string) {
  await page.getByTestId('property-card').getByRole('link', { name: nickname, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nickname);
  await expect.poll(() => page.evaluate(() => window.scrollY), 'the detail page opens at its photo, not at the list scroll').toBe(0);
}

const tabs = (page: Page) => page.getByRole('navigation', { name: /^(Các mục của tài sản|Property sections)$/ }).getByRole('link');

/** Rule 1 and Rule 5: the photo leads, both addresses show with their labels, and the five tabs exist. */
async function expectDiAn(page: Page, words: { current: string; legal: string; tabs: string[] }) {
  const photo = page.getByTestId('property-header').getByTestId('property-cover').locator('img');
  await expect(photo).toHaveAttribute('src', SIGNED_PHOTO);
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const photoBox = await photo.boundingBox();
  const titleBox = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(photoBox !== null && titleBox !== null && photoBox.y < titleBox.y, 'the photo sits above the nickname').toBe(true);

  const addresses = page.getByTestId('property-addresses');
  await expect(addresses.locator('dt')).toHaveText([words.current, words.legal]);
  await expect(addresses.locator('dd').first()).toContainText('TP. Hồ Chí Minh');
  await expect(addresses.locator('dd').last()).toContainText('Tỉnh Bình Dương');
  await expect(tabs(page)).toHaveText(words.tabs);
  await expect(tabs(page).first()).toHaveAttribute('aria-current', 'page');
}

test('rule 1: Mẹ taps Dãy trọ Dĩ An on Tài sản and the detail page leads with its photo and both addresses', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await stubTiles(page);
  const mapChunks: string[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (/\/_next\/static\/chunks\/.+\.js/.test(url) && (await response.text().catch(() => '')).includes(MAPLIBRE_BODY)) mapChunks.push(url);
  });
  await open(page, 'me.lane1@demo.esta.test', 'light');
  await tapCard(page, 'Dãy trọ Dĩ An');
  await expect(page).toHaveURL(new RegExp(`/properties/${propertyId(1, 'di-an')}$`));
  await expectDiAn(page, { current: 'Hiện nay', legal: 'Theo sổ', tabs: ['Tổng quan', 'Pháp lý', 'Cho thuê', 'Tài liệu', 'Hoạt động'] });
  await expect(page.getByTestId('overview-facts')).toContainText('Số phòng');
  await page.waitForLoadState('networkidle');
  expect(mapChunks, 'the detail page fetches no MapLibre chunk while the location card is off screen').toEqual([]);
  await page.getByTestId('location-card').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('location-card').getByTestId('map-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect.poll(() => mapChunks.length).toBeGreaterThan(0);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await tabs(page).filter({ hasText: 'Hoạt động' }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(tabs(page).last()).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('activity-entry').last()).toContainText('Dữ liệu mẫu đã thêm tài sản');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: Ryan opens Kho Biên Hòa, sees the warehouse tile and the pin, and Sửa vị trí opens its panel', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await stubTiles(page);
  await open(page, 'ryan.lane2@demo.esta.test', 'dark');
  await tapCard(page, 'Kho Biên Hòa');
  await expect(page.getByTestId('property-header').getByTestId('property-icon-tile')).toHaveAttribute('data-kind', 'warehouse');

  const card = page.getByTestId('location-card');
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByTestId('map-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(card.getByTestId('property-pin')).toHaveAccessibleName('Kho Biên Hòa');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await card.getByRole('link', { name: 'Sửa vị trí' }).click();
  await expect(page).toHaveURL(new RegExp(`view=map&locate=${propertyId(2, 'bien-hoa')}`));
  await expect(page.getByTestId('location-panel').getByRole('heading', { level: 2 })).toHaveText('Vị trí của Kho Biên Hòa');
});

test('rule 3: Mẹ sets the Đất vườn Long An pin from its card and Hoạt động names her with the test clock time', async ({ page, request }) => {
  await page.setViewportSize(PHONE);
  await stubTiles(page);
  const id = propertyId(3, 'long-an');
  await open(page, 'me.lane3@demo.esta.test', 'dark');
  await setLocation(page, id, null);
  try {
    await setClock(request, '2026-10-07T09:00:00+07:00');
    await tapCard(page, 'Đất vườn Long An');
    const card = page.getByTestId('location-card');
    await expect(card).toContainText('Chưa có vị trí');
    await card.getByRole('link', { name: 'Đặt vị trí' }).click();
    await expect(page).toHaveURL(new RegExp(`locate=${id}`));

    const input = page.getByTestId('location-panel').getByRole('textbox', { name: 'Liên kết Google Maps' });
    await input.fill(LONG_LINK);
    await input.evaluate((element, value) => {
      const data = new DataTransfer();
      data.setData('text', value);
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, LONG_LINK);
    await expect(page.getByTestId('link-preview')).toContainText('10.5331, 106.4052');
    await page.getByTestId('location-panel').getByRole('button', { name: 'Dùng vị trí này' }).click();
    await expect(page.locator('[data-slot="toast"]')).toContainText('Đã lưu vị trí Đất vườn Long An.');

    await page.goto(`/properties/${id}`);
    await tabs(page).filter({ hasText: 'Hoạt động' }).click();
    await expect(page.getByTestId('activity-entry').first()).toHaveText('Nguyễn Thị Demo đã cập nhật vị trí lúc 09:00, 07/10/2026');
    await expect(page.getByTestId('activity-entry').first()).toHaveAttribute('data-event', 'location');
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await setClock(request, null);
    await setLocation(page, id, null);
  }
});

test('rule 4: another household’s property id renders the not-found page with none of its data', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, 'ryan.lane4@demo.esta.test', 'light');
  expect((await page.goto(`/properties/${propertyId(4, 'q7')}`))?.status()).toBe(200);
  const otherId = propertyId(5, 'q7');
  const response = await page.goto(`/properties/${otherId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId('property-not-found')).toContainText('Không tìm thấy tài sản này');
  await expect(page.getByTestId('property-header')).toHaveCount(0);
  const html = (await response?.text()) ?? '';
  expect(html).not.toContain(seedId('seed:household:lane-5'));
  expect(html).not.toContain('Gia đình Demo 5');
  expect(html).not.toMatch(SIGNED_PHOTO);
  expect(html).not.toContain('Số 901 Demo');

  const activity = await page.goto(`/properties/${otherId}/activity`);
  expect(activity?.status()).toBe(404);
  await expect(page.getByTestId('property-not-found')).toBeVisible();
  await expect(page.getByTestId('activity-entry')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: in English at 130% and dark the labels and tabs translate, the addresses stay Vietnamese and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await stubTiles(page);
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, 'me.lane10@demo.esta.test');
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);

  await page.goto('/properties');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await tapCard(page, 'Dãy trọ Dĩ An');
  await expectDiAn(page, { current: 'Current', legal: 'On the certificate', tabs: ['Overview', 'Legal', 'Rental', 'Documents', 'Activity'] });
  await expect(page.getByTestId('overview-facts')).toContainText('Rooms');
  expect(await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth), 'no horizontal page scroll').toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await tabs(page).filter({ hasText: 'Activity' }).click();
  await expect(page.getByTestId('activity-entry').last()).toContainText('Sample data added the property');
  expect(await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth), 'no horizontal page scroll').toBe(true);
});

test('rule 6: a viewer sees the pin on the location card but no Sửa vị trí, a control it could not save', async ({ page, browser }) => {
  await signIn(page, 'me.lane7@demo.esta.test');
  const viewer = await inviteViewer(page, browser);
  try {
    await stubTiles(viewer.page);
    await viewer.page.goto(`/properties/${propertyId(7, 'bien-hoa')}`);
    const card = viewer.page.getByTestId('location-card');
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId('property-pin')).toHaveAccessibleName('Kho Biên Hòa');
    await expect(card.getByRole('link', { name: 'Sửa vị trí' })).toHaveCount(0);
  } finally {
    await viewer.context.close();
  }
});

async function inviteViewer(page: Page, browser: Browser) {
  const email = `viewer.${randomUUID().slice(0, 8)}@demo.esta.test`;
  await page.goto('/onboarding');
  await page.getByLabel('Email người được mời').fill(email);
  await page.getByLabel(/^Chỉ xem/).check();
  await page.getByRole('button', { name: 'Mời', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã mời ${email} với quyền Chỉ xem.`);
  const context = await browser.newContext({ viewport: PHONE });
  const viewerPage = await context.newPage();
  await signIn(viewerPage, email);
  return { context, page: viewerPage };
}
