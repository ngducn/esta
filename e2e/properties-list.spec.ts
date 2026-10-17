import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';

const repoRoot = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(repoRoot, slot);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/property-photos\//;

const LANE_SEVEN = ['Căn hộ Thủ Đức', 'Dãy trọ Dĩ An', 'Đất Bảo Lộc', 'Đất vườn Long An', 'Kho Biên Hòa', 'Mặt bằng Quận 1', 'Nhà phố Q7'];

function onlyOn(project: 'mobile' | 'desktop') {
  test.skip(test.info().project.name !== project, `runs at the ${project} viewport`);
}

async function open(page: Page, email: string, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
  await page.getByRole('navigation', { name: /^(Các mục chính|Main sections)$/ }).getByRole('link', { name: /^(Tài sản|Properties)$/ }).first().click();
  await expect(page).toHaveURL(/\/properties$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByTestId('property-count'), 'the list replaced the loading skeleton').toBeVisible();
}

const cards = (page: Page) => page.getByTestId('property-card');
const card = (page: Page, nickname: string) => cards(page).filter({ has: page.getByRole('heading', { name: nickname, exact: true }) });
const nicknames = (page: Page) => cards(page).getByRole('heading', { level: 2 });
const search = (page: Page) => page.getByRole('searchbox');

async function typeSearch(page: Page, query: string) {
  await search(page).fill(query);
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(query).replaceAll('%20', '(\\+|%20)')}`), { timeout: 15_000 });
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((cookie) => cookie.value)
    .join('');
  return (JSON.parse(Buffer.from(chunks.replace(/^base64-/, ''), 'base64url').toString('utf8')) as { access_token: string }).access_token;
}

async function expectRule2Results(page: Page) {
  await typeSearch(page, 'di an');
  await expect(nicknames(page)).toHaveText(['Dãy trọ Dĩ An']);
  await typeSearch(page, 'binh duong');
  await expect(nicknames(page), 'the phrase means the former province, not a Bình ward beside a Đường').toHaveText(['Dãy trọ Dĩ An']);
  await typeSearch(page, 'quan 7');
  await expect(nicknames(page)).toHaveText(['Nhà phố Q7']);
}

test('rule 1: Mẹ sees seven cards, each led by its photo or its kind tile, with both addresses', async ({ page }) => {
  onlyOn('mobile');
  await open(page, 'me.lane1@demo.esta.test', 'light');
  await expect(nicknames(page)).toHaveText(LANE_SEVEN);
  await expect(page.getByTestId('property-count')).toHaveText('7 tài sản');

  for (const nickname of LANE_SEVEN) {
    const first = card(page, nickname).locator(':scope > *').first();
    await expect(first, `${nickname} leads with its cover`).toHaveAttribute('data-testid', 'property-cover');
  }
  const photos = cards(page).locator('[data-testid="property-cover"] img');
  await expect(photos).toHaveCount(6);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toHaveAttribute('src', SIGNED_PHOTO);
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(card(page, 'Kho Biên Hòa').getByTestId('property-icon-tile')).toBeVisible();
  await expect(card(page, 'Kho Biên Hòa').locator('img')).toHaveCount(0);

  const diAn = card(page, 'Dãy trọ Dĩ An');
  await expect(diAn).toContainText('Phường Dĩ An, TP. Hồ Chí Minh');
  const certificate = diAn.getByTestId('certificate-line');
  await expect(certificate).toHaveText(/^Theo sổ: .*Tỉnh Bình Dương$/);
  const [addressColor, certificateColor] = await Promise.all([
    diAn.locator('p').first().evaluate((el) => getComputedStyle(el).color),
    certificate.evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(certificateColor, 'the certificate line is muted against the current address').not.toBe(addressColor);
  await expect(card(page, 'Căn hộ Thủ Đức').locator('img')).toHaveAttribute('fetchpriority', 'high');
  await expect(card(page, 'Đất vườn Long An').locator('img')).toHaveAttribute('loading', 'lazy');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: di an and binh duong leave Dãy trọ Dĩ An, quan 7 leaves Nhà phố Q7', async ({ page }) => {
  onlyOn('mobile');
  await open(page, 'me.lane2@demo.esta.test', 'dark');
  await expectRule2Results(page);
  await expect(page.getByTestId('property-count')).toHaveText('1 trong 7 tài sản');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 3: bao loc leaves Đất Bảo Lộc with its photo, and clearing brings back seven', async ({ page }) => {
  onlyOn('desktop');
  await open(page, 'ryan.lane3@demo.esta.test', 'light');
  await typeSearch(page, 'bao loc');
  await expect(nicknames(page)).toHaveText(['Đất Bảo Lộc']);
  await expect(card(page, 'Đất Bảo Lộc').locator('img')).toHaveAttribute('src', SIGNED_PHOTO);
  await search(page).fill('');
  await expect(page).toHaveURL(/\/properties$/);
  await expect(nicknames(page)).toHaveText(LANE_SEVEN);
});

test('rule 4: the former and current province chips filter, and a reload keeps the chip', async ({ page }) => {
  onlyOn('desktop');
  await open(page, 'ryan.lane4@demo.esta.test', 'dark');
  const province = (name: string) => page.locator('a[data-filter="province"]').filter({ hasText: new RegExp(`^${name}\\s*\\d+$`) });
  await province('Bình Dương \\(cũ\\)').click();
  await expect(page).toHaveURL(/province=/);
  await expect(nicknames(page)).toHaveText(['Dãy trọ Dĩ An']);
  await province('TP\\. Hồ Chí Minh').click();
  await expect(page).toHaveURL(/province=79/);
  await expect(nicknames(page)).toHaveText(['Căn hộ Thủ Đức', 'Dãy trọ Dĩ An', 'Mặt bằng Quận 1', 'Nhà phố Q7']);
  await page.reload();
  await expect(province('TP\\. Hồ Chí Minh')).toHaveAttribute('aria-current', 'true');
  await expect(nicknames(page)).toHaveText(['Căn hộ Thủ Đức', 'Dãy trọ Dĩ An', 'Mặt bằng Quận 1', 'Nhà phố Q7']);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: a member cannot sign or read another household photo, and her page names none', async ({ page }) => {
  onlyOn('mobile');
  await open(page, 'me.lane5@demo.esta.test', 'light');
  const ownHousehold = seedId('seed:household:lane-5');
  const otherHousehold = seedId('seed:household:lane-6');
  const otherPath = `${otherHousehold}/${seedId('seed:property:lane-6:q7')}/nha-pho.webp`;
  const headers = { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}` };

  const sign = await page.request.post(`${supabaseUrl}/storage/v1/object/sign/property-photos/${otherPath}`, { headers, data: { expiresIn: 60 } });
  expect(sign.ok(), 'signing household 6 photo through her session fails').toBe(false);
  const read = await page.request.get(`${supabaseUrl}/storage/v1/object/authenticated/property-photos/${otherPath}`, { headers });
  expect(read.ok(), 'reading household 6 photo with her token fails').toBe(false);
  const own = await page.request.get(
    `${supabaseUrl}/storage/v1/object/authenticated/property-photos/${ownHousehold}/${seedId('seed:property:lane-5:q7')}/nha-pho.webp`,
    { headers },
  );
  expect(own.ok(), 'the same request for her own photo succeeds, so the refusal above is the policy').toBe(true);

  const html = await page.content();
  const paths = [...html.matchAll(/property-photos\/([0-9a-f-]{36})\//g)].map((match) => match[1]);
  expect(paths.length).toBeGreaterThan(0);
  expect(new Set(paths)).toEqual(new Set([ownHousehold]));
  expect(html).not.toContain(otherHousehold);
});

test('rule 6: 1,000 properties stay virtualized and the search still finds one', async ({ page }) => {
  onlyOn('desktop');
  test.setTimeout(120_000);
  execFileSync(join(repoRoot, 'node_modules', '.bin', 'tsx'), [join(repoRoot, 'scripts', 'seed-bulk-properties.ts'), '--household', '8', '--count', '1000'], {
    env: { ...process.env, ESTA_SLOT: String(slot) },
  });
  await open(page, 'ryan.lane8@demo.esta.test', 'dark');
  await expect(page.getByTestId('virtual-property-list')).toBeVisible();
  let most = 0;
  const last = card(page, 'Tài sản Demo 1000');
  for (let step = 0; step < 200 && !(await last.isVisible()); step++) {
    most = Math.max(most, await cards(page).count());
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(30);
  }
  await expect(last).toBeVisible();
  most = Math.max(most, await cards(page).count());
  expect(most, 'the DOM never holds more than 60 cards').toBeLessThanOrEqual(60);
  await page.evaluate(() => window.scrollTo(0, 0));
  await typeSearch(page, 'demo 0999');
  await expect(nicknames(page)).toHaveText(['Tài sản Demo 0999']);
});

test('rule 7: in English at 130% and dark the chips and headings translate and the results hold', async ({ page }) => {
  onlyOn('mobile');
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, 'me.lane10@demo.esta.test');
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);
  await page.goto('/properties');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Properties');
  await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible();
  await expect(page.getByTestId('property-count')).toHaveText('7 properties');
  await expect(card(page, 'Kho Biên Hòa').getByText('Warehouse', { exact: true })).toBeVisible();
  await expect(nicknames(page)).toHaveText(LANE_SEVEN);
  await expectRule2Results(page);
  expect(await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth), 'no horizontal page scroll').toBe(true);

  await search(page).fill('');
  await expect(nicknames(page)).toHaveCount(7);
  await page.getByRole('button', { name: 'Filters' }).click();
  const sheet = page.getByRole('heading', { name: 'Filter properties' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#property-filters').getByRole('heading', { level: 3 }).first()).toHaveText('Province');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('no match names the query and offers Xóa bộ lọc', async ({ page }) => {
  onlyOn('mobile');
  await open(page, 'me.lane1@demo.esta.test', 'light');
  await typeSearch(page, 'khong co dau');
  await expect(page.getByText('Không có tài sản nào khớp với “khong co dau”.')).toBeVisible();
  await page.getByRole('link', { name: 'Xóa bộ lọc' }).click();
  await expect(nicknames(page)).toHaveCount(7);
  await expect(search(page)).toHaveValue('');
});

test('sort offers name and area in a 44 px control, and the URL keeps the choice', async ({ page }) => {
  onlyOn('mobile');
  await open(page, 'me.lane1@demo.esta.test', 'light');
  const sort = page.getByRole('combobox', { name: /^Sắp xếp/ });
  await expect(sort.locator('option')).toHaveText(['Tên', 'Khu vực']);
  const box = await sort.boundingBox();
  expect(box?.height, 'the select itself is a 44 px target').toBeGreaterThanOrEqual(44);
  expect(box?.width, 'the select itself is a 44 px target').toBeGreaterThanOrEqual(44);

  const byArea = ['Kho Biên Hòa', 'Căn hộ Thủ Đức', 'Dãy trọ Dĩ An', 'Mặt bằng Quận 1', 'Nhà phố Q7', 'Đất Bảo Lộc', 'Đất vườn Long An'];
  await sort.selectOption({ label: 'Khu vực' });
  await expect(page).toHaveURL(/[?&]sort=area/);
  await expect(nicknames(page), 'Đồng Nai, then Hồ Chí Minh, Lâm Đồng and Tây Ninh').toHaveText(byArea);
  await page.reload();
  await expect(sort).toHaveValue('area');
  await expect(nicknames(page)).toHaveText(byArea);
  await sort.selectOption({ label: 'Tên' });
  await expect(page).toHaveURL(/\/properties$/);
  await expect(nicknames(page)).toHaveText(LANE_SEVEN);
});
