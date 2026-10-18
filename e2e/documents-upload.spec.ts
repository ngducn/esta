import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { join } from 'node:path';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { makeLargeImage } from './helpers/make-large-image';
import { accessToken } from './helpers/session';
import { setClock } from './helpers/test-clock';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = e2eServiceHeaders();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const COLD_ROUTE = { timeout: 15_000 };
const fixture = (path: string) => join(repoRoot, 'fixtures', 'certificates', path);
const household = (lane: number) => seedId(`seed:household:lane-${lane}`);
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const documentId = (lane: number, key: string) => seedId(`seed:document:lane-${lane}:${key}`);
const largeDir = join(tmpdir(), `esta-documents-${process.pid}`);

test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });
test.beforeAll(() => mkdirSync(largeDir, { recursive: true }));

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function serviceGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${supabaseUrl}/rest/v1/${path}`, { headers: service });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function servicePatch(page: Page, path: string, data: unknown) {
  const response = await page.request.patch(`${supabaseUrl}/rest/v1/${path}`, { headers: { ...service, 'content-type': 'application/json' }, data });
  expect(response.ok(), await response.text()).toBe(true);
}

async function folder(page: Page, prefix: string): Promise<{ name: string; metadata: { size: number } | null }[]> {
  const response = await page.request.post(`${supabaseUrl}/storage/v1/object/list/documents`, {
    headers: { ...service, 'content-type': 'application/json' },
    data: { prefix, limit: 100 },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { name: string; metadata: { size: number } | null }[];
}

type DocumentRow = { id: string; title: string; sensitivity: string; size_bytes: number; page_count: number | null; storage_path: string; deleted_at: string | null };
const liveDocuments = (page: Page, lane: number, key: string) =>
  serviceGet<DocumentRow[]>(page, `documents?property_id=eq.${propertyId(lane, key)}&deleted_at=is.null&select=id,title,sensitivity,size_bytes,page_count,storage_path,deleted_at&order=created_at.desc`);
const archiveNewDocuments = async (page: Page, lane: number, key: string) => {
  const seeded = new Set<string>(['certificate', 'insurance', 'lease'].map((name) => documentId(lane, `${key}:${name}`)));
  for (const row of await liveDocuments(page, lane, key)) {
    if (!seeded.has(row.id)) await servicePatch(page, `documents?id=eq.${row.id}`, { deleted_at: '2026-10-07T09:00:00+07:00' });
  }
};
const accessCount = async (page: Page, filter: string) => (await serviceGet<unknown[]>(page, `document_access_log?select=id&${filter}`)).length;

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const documentsPage = (page: Page, lane: number, key: string) => page.goto(`/properties/${propertyId(lane, key)}/documents`);
const tile = (page: Page, title: string) => page.getByTestId('document-tile').filter({ has: page.getByTestId('document-link').filter({ hasText: title }) });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Every server action request body, so a test can prove no file bytes went through one. */
function actionBodies(page: Page): number[] {
  const sizes: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) sizes.push(request.postDataBuffer()?.length ?? 0);
  });
  return sizes;
}

const isFilePut = (request: Request) =>
  request.method() === 'PUT' && request.url().includes('/storage/v1/object/upload/sign/documents/') && !/\/thumb(-blur)?\.webp\?/.test(request.url());

async function uploadThroughCamera(page: Page, file: string) {
  await page.getByTestId('add-document').click();
  await expect(page.getByTestId('upload-sheet')).toBeVisible();
  await page.getByTestId('camera-input').setInputFiles(file);
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
}

test('rule 1: Mẹ photographs the Long An certificate, sees it saved and blurred, and the bytes go straight to Storage (DOC-1)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await archiveNewDocuments(page, 1, 'long-an');
  const bodies = actionBodies(page);
  const puts: Request[] = [];
  page.on('request', (request) => (isFilePut(request) ? puts.push(request) : undefined));
  try {
    await documentsPage(page, 1, 'long-an');
    await expect(page.getByTestId('documents-empty')).toHaveText('Chưa có tài liệu nào. Thêm ảnh sổ, hợp đồng hoặc hóa đơn.', COLD_ROUTE);
    await uploadThroughCamera(page, fixture('gcn_2024-photo/page-1.jpg'));
    await expect(page.getByTestId('document-category')).toHaveValue('certificate');
    await expect(page.getByTestId('document-category').locator('option:checked')).toHaveText('Sổ đỏ / sổ hồng');
    await expect(page.getByTestId('document-title')).toHaveValue('Sổ hồng Long An');
    await expect(page.getByTestId('upload-preview')).toHaveAttribute('data-blurred', 'true');
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.getByTestId('save-document').click();
    await expect(page.getByRole('region', { name: /Thông báo/ }).getByText('Đã lưu Sổ hồng Long An.')).toBeVisible({ timeout: 30_000 });

    const [row] = await liveDocuments(page, 1, 'long-an');
    expect(row?.title).toBe('Sổ hồng Long An');
    expect(row?.sensitivity).toBe('sensitive');
    expect(puts, 'the file went in one PUT to a signed upload URL').toHaveLength(1);
    expect(Math.max(...bodies), 'no server action body carries file bytes').toBeLessThan(10 * 1024);
    const names = (await folder(page, `${household(1)}/${row?.id}/`)).map((object) => object.name).toSorted();
    expect(names, 'the bucket holds the file and both thumbnails').toEqual(['page-1.jpg', 'thumb-blur.webp', 'thumb.webp']);
    await expect(tile(page, 'Sổ hồng Long An')).toHaveAttribute('data-blurred', 'true');
    const object = async (name: string) =>
      Buffer.from(await (await page.request.get(`${supabaseUrl}/storage/v1/object/documents/${household(1)}/${row?.id}/${name}`, { headers: service })).body());
    const [clear, blurred] = await Promise.all([object('thumb.webp'), object('thumb-blur.webp')]);
    const size = await sharp(clear).metadata();
    expect(Math.max(size.width ?? 0, size.height ?? 0), 'the thumbnail is at most 320 px on its long side').toBe(320);
    expect(clear.equals(blurred), 'the blurred thumbnail differs from the clear one').toBe(false);

    await tile(page, 'Sổ hồng Long An').getByTestId('document-link').first().click();
    await expect(page).toHaveURL(new RegExp(`/documents/${row?.id}$`), COLD_ROUTE);
    const image = page.locator('img[data-testid="document-page"]');
    await expect(image).toBeVisible(COLD_ROUTE);
    await image.evaluate((img: HTMLImageElement) => img.decode());
    if (process.env.ESTA_VIDEO === '1') await page.screenshot({ path: test.info().outputPath('opened.png') });
    expect(await image.getAttribute('src'), 'Mẹ opens her upload through a signed URL').toMatch(new RegExp(`/storage/v1/object/sign/documents/${household(1)}/${row?.id}/page-1\\.jpg\\?token=`));
  } finally {
    await archiveNewDocuments(page, 1, 'long-an');
  }
});

test('rule 2: a 20 MB photo uploads whole, and a 10 MB one shows progress in words on a 10 Mbps line (DOC-1, SPEC §7.2)', async ({ page }) => {
  test.setTimeout(180_000);
  const twenty = makeLargeImage(largeDir, 'anh-20mb.jpg', 20 * 1024 * 1024);
  const ten = makeLargeImage(largeDir, 'anh-10mb.jpg', 10 * 1024 * 1024);
  await open(page, 'me.lane2@demo.esta.test', 'dark', PHONE);
  await archiveNewDocuments(page, 2, 'long-an');
  try {
    await documentsPage(page, 2, 'long-an');
    await uploadThroughCamera(page, twenty);
    await page.getByTestId('save-document').click();
    await expect(page.getByText('Đã lưu Sổ hồng Long An.')).toBeVisible({ timeout: 60_000 });
    const [big] = await liveDocuments(page, 2, 'long-an');
    expect(big?.size_bytes).toBe(statSync(twenty).size);
    const stored = (await folder(page, `${household(2)}/${big?.id}/`)).find((object) => object.name === 'anh-20mb.jpg');
    expect(stored?.metadata?.size).toBe(statSync(twenty).size);

    await uploadThroughCamera(page, ten);
    await page.getByTestId('document-title').fill('Ảnh 10 MB');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 10_000_000 / 8, uploadThroughput: 10_000_000 / 8 });
    const percents: number[] = [];
    const started = Date.now();
    await page.getByTestId('save-document').click();
    await expect(page.getByTestId('upload-percent')).toBeVisible({ timeout: 1_000 });
    const firstProgress = Date.now() - started;
    const done = page.getByText('Đã lưu Ảnh 10 MB.');
    while (!(await done.isVisible()) && Date.now() - started < 15_000) {
      const text = await page.getByTestId('upload-percent').textContent().catch(() => null);
      const percent = Number(/(\d+)%/.exec(text ?? '')?.[1] ?? Number.NaN);
      if (!Number.isNaN(percent)) percents.push(percent);
      await page.waitForTimeout(200);
    }
    await expect(done).toBeVisible({ timeout: 1_000 });
    const elapsed = Date.now() - started;
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    test.info().annotations.push({ type: 'perf', description: `10 MB at 10 Mbps: first progress ${firstProgress} ms, done ${elapsed} ms` });
    expect(firstProgress).toBeLessThanOrEqual(1_000);
    expect(percents.some((percent) => percent >= 10 && percent <= 90), `percents seen: ${percents.join(', ')}`).toBe(true);
    expect(elapsed).toBeLessThanOrEqual(12_000);
  } finally {
    await archiveNewDocuments(page, 2, 'long-an');
  }
});

test('rule 3: Ryan drops a scanned PDF on Bảo Lộc and is warned before uploading the same certificate twice (DOC-1)', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 'ryan.lane3@demo.esta.test', 'light', DESKTOP);
  await archiveNewDocuments(page, 3, 'bao-loc');
  try {
    await documentsPage(page, 3, 'bao-loc');
    await expect(page.getByTestId('add-document'), 'React owns the drop zone').toBeEnabled(COLD_ROUTE);
    const bytes = readFileSync(fixture('gcn_2009_2024-scan/document.pdf')).toString('base64');
    const transfer = await page.evaluateHandle((data) => {
      const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'document.pdf', { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    }, bytes);
    await page.getByTestId('drop-zone').dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.getByTestId('document-property')).toHaveValue('Đất Bảo Lộc');
    await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('document-title').fill('Bản sao sổ Bảo Lộc');
    await page.getByTestId('save-document').click();
    await expect(page.getByText('Đã lưu Bản sao sổ Bảo Lộc.')).toBeVisible({ timeout: 30_000 });
    const pdf = (await liveDocuments(page, 3, 'bao-loc')).find((row) => row.title === 'Bản sao sổ Bảo Lộc');
    expect(pdf?.page_count).toBe(3);
    expect((await folder(page, `${household(3)}/${pdf?.id}/`)).map((object) => object.name)).toContain('thumb.webp');

    const before = (await liveDocuments(page, 3, 'bao-loc')).length;
    await page.getByTestId('add-document').click();
    await page.getByTestId('file-input').setInputFiles(fixture('gcn_2009_2024-photo/page-1.jpg'));
    await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('save-document').click();
    await expect(page.getByTestId('duplicate-dialog')).toContainText('Tài liệu này đã có: Sổ hồng Bảo Lộc. Vẫn tải lên?');
    await page.getByTestId('duplicate-dialog').getByRole('button', { name: 'Hủy' }).click();
    await expect(page.getByTestId('duplicate-dialog')).toBeHidden();
    expect((await liveDocuments(page, 3, 'bao-loc')).length).toBe(before);
  } finally {
    await archiveNewDocuments(page, 3, 'bao-loc');
  }
});

test('rule 4: a 30 MB photo is refused before any request, and Hoàn tác archives an upload (DOC-1)', async ({ page }) => {
  const thirty = makeLargeImage(largeDir, 'anh-30mb.jpg', 30 * 1024 * 1024);
  await open(page, 'me.lane4@demo.esta.test', 'light', PHONE);
  await archiveNewDocuments(page, 4, 'long-an');
  const storageRequests: string[] = [];
  page.on('request', (request) => (request.url().startsWith(`${supabaseUrl}/storage/`) ? storageRequests.push(request.url()) : undefined));
  try {
    await documentsPage(page, 4, 'long-an');
    await page.getByTestId('add-document').click();
    await page.getByTestId('camera-input').setInputFiles(thirty);
    await expect(page.getByText('Tệp lớn hơn 25 MB. Hãy chọn tệp nhỏ hơn hoặc chụp lại.')).toBeVisible();
    await page.getByTestId('save-document').click();
    await expect(page.getByText('Tệp lớn hơn 25 MB. Hãy chọn tệp nhỏ hơn hoặc chụp lại.')).toBeVisible();
    expect(storageRequests).toEqual([]);

    await page.getByTestId('camera-input').setInputFiles(fixture('so_hong_pre2009-low-light/page-1.jpg'));
    await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('save-document').click();
    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(tile(page, 'Sổ hồng Long An')).toHaveCount(0, COLD_ROUTE);
    const rows = await serviceGet<DocumentRow[]>(page, `documents?property_id=eq.${propertyId(4, 'long-an')}&select=id,deleted_at&order=created_at.desc&limit=1`);
    expect(rows[0]?.deleted_at).not.toBeNull();
  } finally {
    await archiveNewDocuments(page, 4, 'long-an');
  }
});

test('rule 5: the view route answers a no-store redirect to a signed URL and logs one view (DOC-4)', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'dark', DESKTOP);
  const id = documentId(5, 'bao-loc:certificate');
  const user = seedId('seed:user:ryan-lane-5');
  const before = await accessCount(page, `document_id=eq.${id}&user_id=eq.${user}&action=eq.view`);
  const response = await page.request.get(`/api/documents/${id}/view`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()['cache-control']).toBe('no-store');
  const location = response.headers().location ?? '';
  expect(location.startsWith(`${supabaseUrl}/storage/v1/object/sign/documents/`)).toBe(true);
  expect(new URL(location).searchParams.get('token')).toBeTruthy();
  const image = await page.request.get(location);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/jpeg');
  expect(await accessCount(page, `document_id=eq.${id}&user_id=eq.${user}&action=eq.view`)).toBe(before + 1);
});

test('rule 6: the Bảo Lộc certificate stays blurred until Xem, then blurs again when the tab is hidden (DOC-5)', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'dark', PHONE);
  const id = documentId(6, 'bao-loc:certificate');
  const clearThumbs: string[] = [];
  page.on('request', (request) => (request.url().includes(`${id}/thumb.webp`) ? clearThumbs.push(request.url()) : undefined));
  const before = await accessCount(page, `document_id=eq.${id}&action=eq.view`);
  await documentsPage(page, 6, 'bao-loc');
  const certificate = tile(page, 'Sổ hồng Bảo Lộc');
  await expect(certificate).toHaveAttribute('data-blurred', 'true', COLD_ROUTE);
  await expect(certificate.locator('img')).toHaveAttribute('src', /thumb-blur\.webp/);
  expect(clearThumbs, 'no clear thumbnail before the tap').toEqual([]);
  await certificate.getByTestId('reveal-thumbnail').click();
  await expect(certificate).toHaveAttribute('data-blurred', 'false');
  await expect(certificate.locator('img')).toHaveAttribute('src', /\/thumb\.webp/);
  expect(await accessCount(page, `document_id=eq.${id}&action=eq.view`)).toBe(before + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(certificate).toHaveAttribute('data-blurred', 'true');
});

test('rule 11: a certificate tile holds its 4:3 box on a phone and a computer, and Xem waits for hydration (DOC-5)', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let release = () => {};
  const scripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    await scripts;
    await route.continue();
  });
  await page.goto(`/properties/${propertyId(3, 'bao-loc')}/documents`, { waitUntil: 'commit' });
  const certificate = tile(page, 'Sổ hồng Bảo Lộc');
  const xem = certificate.getByTestId('reveal-thumbnail');
  await expect(xem, 'Xem waits for hydration, so an early tap is never lost').toBeDisabled(COLD_ROUTE);
  release();
  await expect(xem).toBeEnabled({ timeout: 60_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const image = certificate.locator('img');
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await image.boundingBox();
    expect(box === null ? null : Math.abs(box.width / box.height - 4 / 3), `the thumbnail keeps 4:3 at ${viewport.width} px, not ${box?.width}x${box?.height}`).toBeLessThan(0.02);
  }
  await xem.click();
  await expect(certificate).toHaveAttribute('data-blurred', 'false');
});

test('rule 7: a member of household 7 reaches nothing of household 8 (FND-2)', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', DESKTOP);
  const other = documentId(8, 'bao-loc:certificate');
  const before = await accessCount(page, `household_id=eq.${household(8)}`);
  expect((await page.request.get(`/api/documents/${other}/view`, { maxRedirects: 0 })).status()).toBe(404);
  const bearer = { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json' };
  const list = await page.request.post(`${supabaseUrl}/storage/v1/object/list/documents`, { headers: bearer, data: { prefix: `${household(8)}/${other}/`, limit: 100 } });
  expect(await list.json()).toEqual([]);
  const sign = await page.request.post(`${supabaseUrl}/storage/v1/object/upload/sign/documents/${household(8)}/${seedId('esta:e2e:intruder')}/x.jpg`, { headers: bearer });
  expect(sign.ok()).toBe(false);
  expect(await accessCount(page, `household_id=eq.${household(8)}`)).toBe(before);
});

test('rule 8: the Q7 insurance counts down on the test clock and Long An asks for its certificate photo (PRP-6)', async ({ page, request }) => {
  await open(page, 'ryan.lane8@demo.esta.test', 'dark', DESKTOP);
  await setClock(request, '2026-10-07T09:00:00+07:00');
  try {
    await documentsPage(page, 8, 'q7');
    await expect(tile(page, 'Bảo hiểm cháy nổ Nhà phố Q7').getByTestId('document-expiry')).toHaveText('Hết hạn sau 23 ngày', COLD_ROUTE);
    await page.goto(`/properties/${propertyId(8, 'long-an')}`);
    const item = page.getByTestId('missing-items').getByRole('listitem').filter({ hasText: 'Thêm ảnh sổ' });
    await expect(item).toHaveCount(1, COLD_ROUTE);
    await expect(item.getByRole('link')).toHaveAttribute('href', `/properties/${propertyId(8, 'long-an')}/documents#upload`);
  } finally {
    await setClock(request, null);
  }
});

test('rule 9: in English at 130% text and dark, the sheet reads in English and nothing scrolls sideways', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  const member = `household_members?id=eq.${seedId('seed:member:me-lane-10')}`;
  await servicePatch(page, member, { locale: 'en', text_scale: 130 });
  await archiveNewDocuments(page, 10, 'long-an');
  try {
    await documentsPage(page, 10, 'long-an');
    await uploadThroughCamera(page, fixture('gcn_2024-photo/page-1.jpg'));
    await expect(page.getByText('Kind of document')).toBeVisible();
    await expect(page.getByTestId('document-title')).toHaveValue('Certificate Long An');
    expect(await noSideScroll(page)).toBe(true);
    await page.getByTestId('save-document').click();
    await expect(page.getByText('Saved Certificate Long An.')).toBeVisible({ timeout: 30_000 });
    expect(await noSideScroll(page)).toBe(true);
  } finally {
    await servicePatch(page, member, { locale: 'vi', text_scale: 100 });
    await archiveNewDocuments(page, 10, 'long-an');
  }
});

test('rule 10: a viewer sees the seeded certificate and no way to add one (FND-2)', async ({ page }) => {
  const email = 'viewer.lane9@demo.esta.test';
  const created = await page.request.post(`${supabaseUrl}/auth/v1/admin/users`, { headers: { ...service, 'content-type': 'application/json' }, data: { email, email_confirm: true } });
  const users = await page.request.get(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers: service });
  const user = ((await users.json()) as { users: { id: string; email: string }[] }).users.find((candidate) => candidate.email === email);
  expect(created.ok() || user !== undefined).toBe(true);
  const member = await page.request.post(`${supabaseUrl}/rest/v1/household_members?on_conflict=household_id,user_id`, {
    headers: { ...service, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates' },
    data: { household_id: household(9), user_id: user?.id, invited_email: email, role: 'viewer' },
  });
  expect(member.ok(), await member.text()).toBe(true);
  await open(page, email, 'light', PHONE);
  await documentsPage(page, 9, 'bao-loc');
  await expect(tile(page, 'Sổ hồng Bảo Lộc')).toBeVisible(COLD_ROUTE);
  await expect(page.getByTestId('add-document')).toHaveCount(0);
  await expect(page.getByTestId('drop-zone')).toHaveCount(0);
});

test('Mẹ titles an upload with a full CCCD, the title is refused before any byte is sent, and nothing is saved (D11)', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  const storagePuts: string[] = [];
  page.on('request', (request) => (request.method() === 'PUT' && request.url().startsWith(`${supabaseUrl}/storage/`) ? storagePuts.push(request.url()) : undefined));
  const before = await liveDocuments(page, 3, 'long-an');
  for (const look of [
    { name: '390-light', theme: 'light', viewport: PHONE },
    { name: '390-dark', theme: 'dark', viewport: PHONE },
    { name: '1440-light', theme: 'light', viewport: DESKTOP },
    { name: '1440-dark', theme: 'dark', viewport: DESKTOP },
  ] as const) {
    await page.setViewportSize(look.viewport);
    await page.context().addCookies([{ name: 'esta_theme', value: look.theme, url: test.info().project.use.baseURL ?? '' }]);
    await documentsPage(page, 3, 'long-an');
    await uploadThroughCamera(page, fixture('gcn_2024-photo/page-1.jpg'));
    await page.getByTestId('document-title').fill('CCCD của mẹ 079123456789');
    await page.getByTestId('save-document').click();
    await expect(page.getByTestId('upload-sheet').getByText('Ô này còn số CCCD/CMND đầy đủ. Chỉ ghi 4 số cuối.')).toBeVisible();
    await expect(page.getByTestId('document-title')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('upload-error')).toHaveCount(0);
    expect(await seriousAxeViolations(page)).toEqual([]);
    const folder = process.env.ESTA_SHOTS;
    if (folder !== undefined) await page.screenshot({ path: join(folder, `upload-title-refused-${look.name}.png`) });
  }
  expect(storagePuts, 'no byte reaches Storage').toEqual([]);
  expect(await liveDocuments(page, 3, 'long-an')).toEqual(before);
});
