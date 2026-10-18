import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { setClock } from './helpers/test-clock';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const rest = `${env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/rest/v1`;
const service = e2eServiceHeaders();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const COLD_ROUTE = { timeout: 15_000 };
const evidence = process.env.ESTA_EVIDENCE_DIR;
const household = (lane: number) => seedId(`seed:household:lane-${lane}`);
const documentId = (lane: number, key: string) => seedId(`seed:document:lane-${lane}:${key}`);
const member = (person: 'me' | 'ryan', lane: number) => `household_members?id=eq.${seedId(`seed:member:${person}-lane-${lane}`)}`;

test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });
test.beforeEach(async ({ request }) => setClock(request, '2026-10-07T09:00:00+07:00'));

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function serviceGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${rest}/${path}`, { headers: service });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function serviceWrite(page: Page, method: 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const response = await page.request.fetch(`${rest}/${path}`, { method, headers: { ...service, 'content-type': 'application/json' }, ...(data === undefined ? {} : { data }) });
  expect(response.ok(), await response.text()).toBe(true);
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const accessCount = async (page: Page, id: string, action: string) => (await serviceGet<unknown[]>(page, `document_access_log?select=id&document_id=eq.${id}&action=eq.${action}`)).length;
const results = (page: Page) => page.getByTestId('vault-results').getByTestId('document-tile');
const expiring = (page: Page, title: string) => page.getByTestId('expiring-item').filter({ hasText: title });
const firstFocusableInMain = (page: Page) =>
  page.getByRole('main').evaluate((main) => main.querySelector('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')?.getAttribute('data-testid') ?? null);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function search(page: Page, query: string) {
  await page.getByTestId('vault-search').fill(query);
}

async function shot(page: Page, name: string) {
  if (evidence === undefined) return;
  mkdirSync(evidence, { recursive: true });
  await page.waitForFunction(() => document.querySelector('[data-testid="reveal-thumbnail"][disabled]') === null);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  });
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
}

test('rule 1: Mẹ opens Tài liệu from Home, types bao loc so and opens Sổ hồng Bảo Lộc, blurred first, within 10 s (DOC-3, DOC-7)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const certificate = documentId(1, 'bao-loc:certificate');
  const views = await accessCount(page, certificate, 'view');
  await page.goto('/');
  const started = Date.now();
  await page.getByRole('navigation').getByRole('link', { name: 'Tài liệu' }).click();
  await expect(page.getByTestId('vault-search')).toBeVisible(COLD_ROUTE);
  expect(await firstFocusableInMain(page), 'the search bar is the first control on Tài liệu').toBe('vault-search');
  await expect(expiring(page, 'Bảo hiểm cháy nổ Nhà phố Q7').getByTestId('expiring-days')).toHaveText('Hết hạn sau 23 ngày');
  await search(page, 'bao loc so');
  await expect(results(page).first().getByTestId('document-link')).toHaveText('Sổ hồng Bảo Lộc');
  await expect(results(page).first()).toHaveAttribute('data-blurred', 'true');
  await expect(results(page).first().getByTestId('reveal-thumbnail')).toHaveText('Xem');
  expect(Date.now() - started, 'from the tab tap to the first result').toBeLessThan(10_000);
  expect(page.url()).toMatch(/\/documents\?q=bao\+loc\+so$/);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await results(page).first().getByTestId('document-link').click();
  await expect(page).toHaveURL(new RegExp(`/documents/${certificate}$`), COLD_ROUTE);
  await expect(page.locator('img[data-testid="document-page"]')).toBeVisible(COLD_ROUTE);
  await page.locator('img[data-testid="document-page"]').evaluate((img: HTMLImageElement) => img.decode());
  expect(await accessCount(page, certificate, 'view'), 'opening the page logs one view').toBe(views + 1);
});

test('rule 2: on a slow phone no request names a sensitive thumbnail before a tap (DOC-5)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'me.lane2@demo.esta.test', 'dark', PHONE);
  const sensitive = (await serviceGet<{ id: string }[]>(page, `documents?household_id=eq.${household(2)}&sensitivity=eq.sensitive&deleted_at=is.null&select=id`)).map((row) => row.id);
  expect(sensitive.length).toBeGreaterThan(0);
  await page.goto('/');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: (1_474_560 * 0.9) / 8, uploadThroughput: (675_000 * 0.9) / 8 });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.getByRole('navigation').getByRole('link', { name: 'Tài liệu' }).click();
  await expect(page.getByTestId('vault-groups')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => requested.filter((url) => url.includes('/thumb-blur.webp')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const clear = requested.filter((url) => sensitive.some((id) => url.includes(`/${id}/thumb.webp`)));
  expect(clear, 'no sensitive thumb.webp before Xem').toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('rule 3: Ryan finds the Thủ Đức lease with hop dong and Theo loại counts every certificate (DOC-3)', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'light', DESKTOP);
  const certificates = (await serviceGet<unknown[]>(page, `documents?household_id=eq.${household(3)}&category=eq.certificate&deleted_at=is.null&select=id`)).length;
  await page.goto('/documents');
  await search(page, 'hop dong');
  await expect(results(page).getByTestId('document-link').filter({ hasText: 'Hợp đồng thuê Căn hộ Thủ Đức' })).toBeVisible(COLD_ROUTE);
  await page.getByTestId('group-by-category').click();
  await expect(page.getByTestId('group-by-category')).toHaveAttribute('aria-pressed', 'true');
  const group = page.getByTestId('vault-group').filter({ has: page.getByTestId('group-label').getByText('Sổ đỏ / sổ hồng', { exact: true }) });
  await expect(group.getByTestId('group-count')).toHaveText(`${certificates} tài liệu`);
  await expect(group.getByTestId('document-tile')).toHaveCount(certificates);
});

test('rule 4: Ryan downloads the Q7 insurance, moves its expiry to 12/10 and undoes it (DOC-4)', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  const insurance = documentId(4, 'q7:insurance');
  const downloads = await accessCount(page, insurance, 'download');
  try {
    await page.goto(`/documents/${insurance}`);
    await expect(page.getByTestId('document-expiry')).toHaveText('Hết hạn sau 23 ngày', COLD_ROUTE);
    expect(await seriousAxeViolations(page)).toEqual([]);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-document').click()]);
    expect(download.suggestedFilename()).toBe('bao-hiem-q7.pdf');
    expect(await accessCount(page, insurance, 'download'), 'one download row').toBe(downloads + 1);

    await page.getByTestId('edit-document').click();
    await expect(page.getByTestId('edit-sheet')).toBeVisible();
    await page.getByLabel('Ngày hết hạn (nếu có)').fill('12/10/2026');
    await page.getByTestId('save-edit').click();
    const toast = page.getByRole('region', { name: /Thông báo/ });
    await expect(toast.getByText('Đã lưu thông tin Bảo hiểm cháy nổ Nhà phố Q7.')).toBeVisible();
    await page.getByRole('link', { name: 'Tất cả tài liệu' }).click();
    await expect(expiring(page, 'Bảo hiểm cháy nổ Nhà phố Q7').getByTestId('expiring-days')).toHaveText('Hết hạn sau 5 ngày', COLD_ROUTE);
    await toast.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(expiring(page, 'Bảo hiểm cháy nổ Nhà phố Q7').getByTestId('expiring-days')).toHaveText('Hết hạn sau 23 ngày');
    expect(await serviceGet(page, `documents?id=eq.${insurance}&select=expires_on`)).toEqual([{ expires_on: '2026-10-30' }]);
    expect(await accessCount(page, insurance, 'download'), 'still one download row').toBe(downloads + 1);
  } finally {
    await serviceWrite(page, 'PATCH', `documents?id=eq.${insurance}`, { expires_on: '2026-10-30' });
  }
});

test('rule 5: a new property shows the empty vault with Thêm tài liệu, and an offline search says so in words', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  const property = seedId(`e2e:property:documents-vault:${Date.now()}`);
  await serviceWrite(page, 'POST', 'properties', { id: property, household_id: household(5), nickname: 'Nhà Demo mới', code: 'VAULT5', kind: 'townhouse', use_mode: 'held' });
  try {
    await page.goto(`/properties/${property}/documents`);
    await expect(page.getByTestId('documents-empty')).toHaveText('Chưa có tài liệu nào. Thêm ảnh sổ, hợp đồng hoặc hóa đơn.', COLD_ROUTE);
    await expect(page.getByTestId('add-document')).toHaveText('Thêm tài liệu');

    await page.goto('/documents');
    await expect(page.getByTestId('vault-search')).toBeVisible(COLD_ROUTE);
    await page.context().setOffline(true);
    await search(page, 'bao loc');
    await expect(page.getByTestId('search-error')).toHaveText('Chưa tải được danh sách. Kiểm tra kết nối mạng rồi thử lại.');
    await expect(page.getByTestId('vault-groups'), 'the vault below stays usable').toBeVisible();
  } finally {
    await page.context().setOffline(false);
    await serviceWrite(page, 'DELETE', `properties?id=eq.${property}`);
  }
});

test('rule 6: in English at 130% and dark, bao loc so still finds Sổ hồng Bảo Lộc first and nothing scrolls sideways', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await serviceWrite(page, 'PATCH', member('me', 10), { locale: 'en', text_scale: 130 });
  try {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Documents' }).click();
    await expect(page.getByTestId('vault-search')).toHaveAttribute('placeholder', 'Search by name or the words on the paper', COLD_ROUTE);
    await expect(page.getByRole('heading', { name: 'Expiring soon' })).toBeVisible();
    await search(page, 'bao loc so');
    await expect(results(page).first().getByTestId('document-link')).toHaveText('Sổ hồng Bảo Lộc');
    await expect(results(page).first()).toHaveAttribute('data-blurred', 'true');
    await expect(page.getByTestId('vault-results').getByRole('heading')).toHaveText('1 result');
    expect(await noSideScroll(page)).toBe(true);
  } finally {
    await serviceWrite(page, 'PATCH', member('me', 10), { locale: 'vi', text_scale: 100 });
  }
});

test('a vault above 100 documents mounts only the rows on screen (SPEC §7.2)', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'light', DESKTOP);
  const ids = Array.from({ length: 150 }, (_, n) => seedId(`e2e:document:vault-virtual:${n}`));
  const rows = ids.map((id, n) => ({
    id,
    household_id: household(7),
    category: 'other',
    title: `Giấy tờ Demo ${n + 1}`,
    storage_path: `${household(7)}/${id}/giay-to.pdf`,
    mime: 'application/pdf',
    size_bytes: 1000,
    sha256: n.toString(16).padStart(64, '0'),
    sensitivity: 'normal',
  }));
  await serviceWrite(page, 'POST', 'documents', rows);
  try {
    await page.goto('/documents');
    await expect(page.getByTestId('virtual-vault')).toBeVisible(COLD_ROUTE);
    await expect(page.getByTestId('document-count')).toHaveText(/^1\d\d tài liệu$/);
    const mounted = await page.getByTestId('vault-groups').getByTestId('document-tile').count();
    expect(mounted, 'only the tiles near the screen are in the DOM').toBeLessThan(40);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId('vault-groups').getByTestId('document-tile').last(), 'the rows at the end mount on scroll').toBeInViewport();
  } finally {
    await serviceWrite(page, 'DELETE', `documents?id=in.(${ids.join(',')})`);
  }
});

test('evidence: every vault state at 390x844 and 1440x900, light and dark', async ({ page }) => {
  test.skip(evidence === undefined, 'screenshots only when ESTA_EVIDENCE_DIR is set');
  test.setTimeout(600_000);
  const LANE = 6;
  await open(page, `me.lane${LANE}@demo.esta.test`, 'light', PHONE);
  const insurance = documentId(LANE, 'q7:insurance');
  const live = (await serviceGet<{ id: string }[]>(page, `documents?household_id=eq.${household(LANE)}&deleted_at=is.null&select=id`)).map((row) => row.id);
  const theme = async (value: 'light' | 'dark') => page.context().addCookies([{ name: 'esta_theme', value, url: test.info().project.use.baseURL ?? '' }]);
  const combos = [PHONE, DESKTOP].flatMap((viewport) => (['light', 'dark'] as const).map((value) => ({ viewport, theme: value, name: `${viewport.width}x${viewport.height}-${value}` })));
  try {
    for (const combo of combos) {
      await page.setViewportSize(combo.viewport);
      await theme(combo.theme);

      await page.goto('/documents');
      await expect(page.getByTestId('expiring-soon')).toBeVisible(COLD_ROUTE);
      await shot(page, `p2-05-vault-${combo.name}`);
      await search(page, 'bao loc so');
      await expect(results(page).first()).toBeVisible();
      await shot(page, `p2-05-search-bao-loc-${combo.name}`);
      await results(page).first().getByTestId('reveal-thumbnail').click();
      await expect(results(page).first()).toHaveAttribute('data-blurred', 'false');
      await results(page).first().locator('img').evaluate((img: HTMLImageElement) => img.decode());
      await shot(page, `p2-05-revealed-${combo.name}`);
      await search(page, 'giay phep xay dung 1999');
      await expect(page.getByTestId('search-empty')).toBeVisible();
      await shot(page, `p2-05-no-results-${combo.name}`);
      await search(page, '');
      await page.getByTestId('group-by-category').click();
      await shot(page, `p2-05-by-category-${combo.name}`);

      await page.goto(`/documents/${insurance}`);
      await expect(page.getByTestId('document-detail')).toBeVisible(COLD_ROUTE);
      await expect(page.locator('canvas[data-testid="document-page"][data-drawn="true"]')).toBeVisible(COLD_ROUTE);
      await shot(page, `p2-05-document-${combo.name}`);
      await page.getByTestId('edit-document').click();
      await expect(page.getByTestId('edit-sheet')).toBeVisible();
      await shot(page, `p2-05-edit-${combo.name}`);
      await page.getByLabel('Ngày hết hạn (nếu có)').fill('12/10/2026');
      await page.getByTestId('save-edit').click();
      await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
      await page.getByRole('link', { name: 'Tất cả tài liệu' }).click();
      await expect(expiring(page, 'Bảo hiểm').getByTestId('expiring-days')).toHaveText('Hết hạn sau 5 ngày', COLD_ROUTE);
      await shot(page, `p2-05-undo-${combo.name}`);
      await page.getByRole('button', { name: 'Hoàn tác' }).click();
      await expect(expiring(page, 'Bảo hiểm').getByTestId('expiring-days')).toHaveText('Hết hạn sau 23 ngày');

      await page.context().setOffline(true);
      await search(page, 'bao loc');
      await expect(page.getByTestId('search-error')).toBeVisible();
      await shot(page, `p2-05-offline-${combo.name}`);
      await page.context().setOffline(false);

      await serviceWrite(page, 'PATCH', member('me', LANE), { role: 'viewer' });
      await page.goto(`/documents/${insurance}`);
      await expect(page.getByTestId('download-document')).toBeVisible(COLD_ROUTE);
      await expect(page.getByTestId('edit-document')).toHaveCount(0);
      await shot(page, `p2-05-viewer-${combo.name}`);
      await serviceWrite(page, 'PATCH', member('me', LANE), { role: 'admin' });

      await serviceWrite(page, 'PATCH', `documents?id=in.(${live.join(',')})`, { deleted_at: '2026-10-07T09:00:00+07:00' });
      await page.goto('/documents');
      await expect(page.getByTestId('documents-empty')).toBeVisible(COLD_ROUTE);
      await shot(page, `p2-05-empty-${combo.name}`);
      await serviceWrite(page, 'PATCH', `documents?id=in.(${live.join(',')})`, { deleted_at: null });
    }
  } finally {
    await page.context().setOffline(false);
    await serviceWrite(page, 'PATCH', member('me', LANE), { role: 'admin' });
    await serviceWrite(page, 'PATCH', `documents?id=in.(${live.join(',')})`, { deleted_at: null });
    await serviceWrite(page, 'PATCH', `documents?id=eq.${insurance}`, { expires_on: '2026-10-30' });
  }
});
