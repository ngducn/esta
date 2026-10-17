import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/property-photos\//;
const UPLOAD_URL = '/storage/v1/object/upload/sign/property-photos/';
const PHOTO = (name: string) => join(repoRoot, 'supabase/seed/photos/source', name);
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const householdId = (lane: number) => seedId(`seed:household:lane-${lane}`);
const FEE = /^1\.200\.000\s₫$/;
const FEE_EN = /^1,200,000\s₫$/;

const onlyOn = (project: 'mobile' | 'desktop') => test.skip(test.info().project.name !== project, `runs at the ${project} viewport`);

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
}

/** Creating properties in a seeded lane would change the counts other specs assert, so those rules get their own household. */
async function newHousehold(page: Page) {
  await signIn(page, `p105.${randomUUID().slice(0, 8)}@demo.esta.test`);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Tên gia đình').fill('Gia đình Demo P105');
  await page.getByLabel('Tên của bạn').fill('Nguyễn Thị Demo');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mời người trong gia đình', { timeout: 20_000 });
}

/** Lists the property's photo folder through the member's own session, as the storage select policy allows. */
async function listPhotos(page: Page, lane: number, id: string): Promise<{ name: string; metadata: { size: number } }[]> {
  const listed = await page.request.post(`${supabaseUrl}/storage/v1/object/list/property-photos`, {
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}` },
    data: { prefix: `${householdId(lane)}/${id}`, limit: 100 },
  });
  expect(listed.ok()).toBe(true);
  return (await listed.json()) as { name: string; metadata: { size: number } }[];
}

/** Waits for hydration, which enables the save button, and turns transitions off, so axe never reads a color mid-fade. */
async function seriousAxeViolations(page: Page): Promise<string[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const save = page.getByTestId('save-property');
  if ((await save.count()) > 0) await expect(save).toBeEnabled();
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const kindSelect = (page: Page) => page.getByTestId('kind-select');

async function openNewForm(page: Page) {
  await page.goto('/properties');
  await page.getByTestId('add-property').click();
  await expect(page).toHaveURL(/\/properties\/new$/);
  await expect(page.getByTestId('property-form')).toBeVisible();
}

async function save(page: Page) {
  await page.getByTestId('save-property').click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/, { timeout: 15_000 });
}

async function apartmentWithFee(page: Page, words: { kind: string; fee: string; floorLabel: string }) {
  await page.getByTestId('nickname').fill('Căn hộ Demo Bình Thọ');
  await kindSelect(page).selectOption({ label: words.kind });
  const fields = page.getByTestId('kind-fields');
  await expect(fields).toHaveAttribute('data-kind', 'apartment');
  for (const key of ['building_name', 'block', 'floor', 'unit_no', 'management_fee_vnd']) await expect(page.getByTestId(`detail-${key}`)).toBeVisible();
  await page.getByTestId('detail-floor').fill('12');
  await page.getByTestId('detail-management_fee_vnd').getByRole('textbox', { name: words.fee }).fill('1tr2');
  await expect(page.getByTestId('money-preview')).toHaveText(FEE);
  await save(page);
  await page.reload();
  await expect(page.getByTestId('overview-facts')).toContainText(words.floorLabel);
  await expect(page.getByTestId('overview-facts')).toContainText(/1\.200\.000\s₫/);
}

test('rule 1: Mẹ adds a townhouse, picks the ward the Dĩ An, Bình Dương suggestion names, and both addresses show', async ({ page }) => {
  onlyOn('mobile');
  await setTheme(page, 'light');
  await newHousehold(page);
  await openNewForm(page);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByTestId('nickname').fill('Nhà phố Demo Dĩ An');
  await kindSelect(page).selectOption({ label: 'Nhà phố' });
  await expect(page.getByTestId('kind-fields')).toHaveCount(0);
  await expect(page.getByTestId('code')).toHaveValue('NPDDA');
  await page.getByTestId('province-select').selectOption({ label: 'Thành phố Hồ Chí Minh' });
  const commune = page.getByTestId('commune-input');
  await commune.fill('di an');
  const option = page.getByRole('option', { name: 'Phường Dĩ An', exact: true });
  const optionBox = await option.boundingBox();
  expect(optionBox !== null && optionBox.height >= 44, 'each ward option is a 44 px target').toBe(true);
  await option.click();
  await expect(commune).toHaveValue('Phường Dĩ An');

  await page.getByTestId('certificate-address').fill('Dĩ An, Bình Dương');
  const first = page.getByTestId('legacy-suggestions').getByRole('button').first();
  await expect(first).toContainText('Phường Dĩ An');
  await expect(first).toContainText('TP. Hồ Chí Minh');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await save(page);

  const addresses = page.getByTestId('property-addresses');
  await expect(addresses.locator('dt')).toHaveText(['Hiện nay', 'Theo sổ']);
  await expect(addresses.locator('dd').first()).toContainText('Phường Dĩ An, TP. Hồ Chí Minh');
  await expect(addresses.locator('dd').last()).toHaveText('Dĩ An, Bình Dương');
});

test('rule 2: an apartment shows its own fields, previews 1tr2 as 1.200.000 ₫ and reads it back after a reload', async ({ page }) => {
  onlyOn('mobile');
  await setTheme(page, 'dark');
  await newHousehold(page);
  await openNewForm(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await apartmentWithFee(page, { kind: 'Căn hộ', fee: 'Phí quản lý mỗi tháng', floorLabel: 'Tầng' });

  await page.getByTestId('edit-property').click();
  await expect(page.getByTestId('money-preview').first()).toHaveText(FEE);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 3: Ryan uploads a cover for Kho Biên Hòa in one PUT to Storage, and its card and header lead with it', async ({ page }) => {
  onlyOn('desktop');
  await setTheme(page, 'light');
  await signIn(page, 'ryan.lane3@demo.esta.test');
  const puts: Request[] = [];
  const actions: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes(UPLOAD_URL)) puts.push(request);
    if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) actions.push(request);
  });
  const id = propertyId(3, 'bien-hoa');
  await page.goto(`/properties/${id}/edit`);
  await expect(page.locator('#cover-photo')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  const uploaded = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(UPLOAD_URL));
  await expect(page.getByTestId('cover-photo-pick')).toBeEnabled();
  await page.getByTestId('cover-photo-file').setInputFiles(PHOTO('nha-pho.webp'));
  expect((await uploaded).ok()).toBe(true);
  await expect(page.getByTestId('cover-photo-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đổi ảnh' })).toBeEnabled();

  await page.goto('/properties');
  const card = page.getByTestId('property-card').filter({ has: page.getByRole('link', { name: 'Kho Biên Hòa', exact: true }) });
  await expect(card.getByTestId('property-cover').locator('img')).toHaveAttribute('src', SIGNED_PHOTO);
  await page.goto(`/properties/${id}`);
  await expect(page.getByTestId('property-header').getByTestId('property-cover').locator('img')).toHaveAttribute('src', SIGNED_PHOTO);

  expect(puts, 'the bytes went in one PUT to a Storage signed upload URL').toHaveLength(1);
  const stored = await listPhotos(page, 3, id);
  expect(stored).toHaveLength(1);
  expect(stored[0]?.metadata.size ?? 0, 'the PUT carried the whole photo into Storage').toBeGreaterThan(5_000);
  expect(puts[0]?.url()).toContain(stored[0]?.name);
  const actionSizes = await Promise.all(actions.map(async (action) => (await action.sizes()).requestBodySize));
  expect(actionSizes.length).toBeGreaterThan(0);
  expect(Math.max(...actionSizes), 'server action bodies are measured').toBeGreaterThan(0);
  expect(Math.max(...actionSizes), 'no server action body carries the photo').toBeLessThanOrEqual(10_240);
});

test('rule 4: Mẹ replaces the cover of Nhà phố Q7, and its folder keeps exactly one object', async ({ page }) => {
  onlyOn('mobile');
  await setTheme(page, 'light');
  await signIn(page, 'me.lane4@demo.esta.test');
  const id = propertyId(4, 'q7');
  await page.goto(`/properties/${id}`);
  const header = page.getByTestId('property-header').getByTestId('property-cover').locator('img');
  const before = await header.getAttribute('src');
  await page.getByTestId('edit-property').click();
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(UPLOAD_URL));
  await expect(page.getByTestId('cover-photo-pick')).toBeEnabled();
  await page.getByTestId('cover-photo-file').setInputFiles(PHOTO('day-tro.webp'));
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Đổi ảnh' })).toBeEnabled();

  await page.goto(`/properties/${id}`);
  await page.reload();
  await expect(header).toHaveAttribute('src', SIGNED_PHOTO);
  expect(new URL((await header.getAttribute('src')) ?? '', page.url()).pathname).not.toBe(new URL(before ?? '', page.url()).pathname);
  await expect.poll(() => header.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

  const objects = await listPhotos(page, 4, id);
  expect(objects.map((object) => object.name), 'one photo object under the property').toHaveLength(1);
  expect(objects[0]?.name).toMatch(/^[0-9a-f-]{36}\.(webp|jpg)$/);
});

test('a failed upload keeps the old photo and offers Thử lại', async ({ page }) => {
  onlyOn('mobile');
  await setTheme(page, 'light');
  await signIn(page, 'me.lane6@demo.esta.test');
  await page.goto(`/properties/${propertyId(6, 'thu-duc')}/edit`);
  const preview = page.getByTestId('cover-photo-preview');
  await expect(page.getByTestId('cover-photo-pick'), 'the picker waits for hydration, so a pick is never lost').toBeEnabled();
  const before = await preview.getAttribute('src');
  const refused = page.waitForRequest((request) => request.url().includes(UPLOAD_URL));
  await page.route((url) => url.pathname.startsWith(UPLOAD_URL), (route) => route.abort('internetdisconnected'));
  await page.getByTestId('cover-photo-file').setInputFiles(PHOTO('dat.webp'));
  await refused;
  await expect(page.getByTestId('cover-photo-error')).toHaveText('Chưa tải được ảnh.');
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(preview).toHaveAttribute('src', before ?? '');
  await page.getByTestId('cover-photo-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Demo') });
  await expect(page.getByTestId('cover-photo-error')).toHaveText('Tệp này không phải ảnh. Chọn một tấm ảnh khác.');
});

test('rule 5: archiving Kho Biên Hòa shows Hoàn tác, the undo brings it back, and Đã lưu trữ restores it', async ({ page }) => {
  onlyOn('desktop');
  await setTheme(page, 'dark');
  await newHousehold(page);
  await openNewForm(page);
  await page.getByTestId('nickname').fill('Kho Biên Hòa');
  await kindSelect(page).selectOption({ label: 'Kho' });
  await save(page);
  const detail = page.url();
  const card = page.getByTestId('property-card').filter({ has: page.getByRole('link', { name: 'Kho Biên Hòa', exact: true }) });

  const archive = async () => {
    await page.goto(`${detail}/edit`);
    await page.getByTestId('archive-property').click();
    await expect(page).toHaveURL(/\/properties$/);
  };
  await archive();
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toHaveText(/^Đã lưu trữ Kho Biên Hòa\.\s*Hoàn tác$/);
  await expect(card).toHaveCount(0);
  await toast.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(card).toHaveCount(1);

  await archive();
  await expect(card).toHaveCount(0);
  await page.getByRole('link', { name: 'Đã lưu trữ' }).click();
  const row = page.getByTestId('archived-row').filter({ hasText: 'Kho Biên Hòa' });
  await row.getByTestId('restore-property').click();
  await expect(row).toHaveCount(0);
  await page.goto('/properties');
  await expect(card).toHaveCount(1);
});

test('rule 6: in English at 130% and dark, the apartment form keeps 1.200.000 ₫ and the page never scrolls sideways', async ({ page }) => {
  onlyOn('mobile');
  await setTheme(page, 'dark');
  await newHousehold(page);
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);

  await page.goto('/properties/new');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add a property');
  await expect(page.getByText('Kind', { exact: true })).toBeVisible();
  await kindSelect(page).selectOption({ label: 'Apartment' });
  await page.getByTestId('detail-management_fee_vnd').getByRole('textbox', { name: 'Monthly management fee' }).fill('1tr2');
  await expect(page.getByTestId('money-preview'), 'English groups thousands with commas (formatVnd, DOMAIN-VN §9)').toHaveText(FEE_EN);
  expect(await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth), 'no horizontal page scroll').toBe(true);
  await page.getByTestId('nickname').fill('Căn hộ Demo Bình Thọ');
  await save(page);
  await page.reload();
  await expect(page.getByTestId('overview-facts')).toContainText(/1,200,000\s₫/);
});

const TEN_KINDS = [
  ['Nhà phố', {}],
  ['Căn hộ', { 'detail-building_name': 'Chung cư Demo', 'detail-unit_no': 'A-12.05' }],
  ['Biệt thự', {}],
  ['Dãy trọ', { 'detail-room_count': '8' }],
  ['Mặt bằng', {}],
  ['Kho', {}],
  ['Đất ở', { 'detail-frontage_m': '8', 'detail-road_width_m': '6' }],
  ['Đất nông nghiệp', { 'detail-frontage_m': '25,5', 'detail-road_width_m': '4' }],
  ['Nhà đất hỗn hợp', {}],
  ['Khác', {}],
] as const;

test('PRP-1: one property of each of the ten kinds saves with its own fields', async ({ page }) => {
  test.setTimeout(180_000);
  onlyOn('desktop');
  await setTheme(page, 'light');
  await newHousehold(page);
  for (const [kind, details] of TEN_KINDS) {
    await page.goto('/properties/new');
    await page.getByTestId('nickname').fill(`${kind} Demo`);
    await kindSelect(page).selectOption({ label: kind });
    for (const [testId, text] of Object.entries(details)) await page.getByTestId(testId).fill(text);
    await save(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${kind} Demo`);
    await expect(page.getByTestId('property-header')).toContainText(kind);
  }
  await page.goto('/properties');
  await expect(page.getByTestId('property-count')).toHaveText('10 tài sản');
});

test('on a slow phone the form takes no typing until it is ready, then keeps what Mẹ types', async ({ page, context }) => {
  onlyOn('mobile');
  test.setTimeout(180_000);
  await signIn(page, 'me.lane6@demo.esta.test');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: 50_000, uploadThroughput: 30_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  for (const path of ['/properties/new', `/properties/${propertyId(6, 'thu-duc')}/edit`]) {
    await page.goto(path, { waitUntil: 'commit' });
    const nickname = page.getByTestId('nickname');
    await nickname.waitFor({ timeout: 60_000 });
    expect(await page.evaluate(() => Object.keys(document.querySelector('form') ?? {}).some((key) => key.startsWith('__react'))), `${path} is still loading`).toBe(false);
    const fields = page.getByTestId('property-form').locator('input:not([type=hidden]), select, textarea');
    const states = await fields.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).matches(':disabled')));
    expect(states.length).toBeGreaterThan(5);
    expect(states.every(Boolean), `${path}: every field waits for the page`).toBe(true);
    await expect(page.getByTestId('form-loading')).toHaveText('Đang tải…');

    await expect(nickname).toBeEnabled({ timeout: 90_000 });
    await expect(page.getByTestId('form-loading')).toHaveCount(0);
    await nickname.fill('Nhà Demo chậm mạng');
    await kindSelect(page).selectOption({ label: 'Dãy trọ' });
    await page.getByTestId('detail-room_count').fill('8');
    await expect(nickname).toHaveValue('Nhà Demo chậm mạng');
    await expect(page.getByTestId('detail-room_count')).toHaveValue('8');
  }
});
