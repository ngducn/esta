import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import { inputHash, type CanonicalInput } from '../apps/agent/src/replay/canonicalize.ts';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { signIn } from './helpers/inbucket';
import { setClock } from './helpers/test-clock';

// Rule 4 runs this slot's one replay worker, so the rules run in order in the `clock` project.
test.describe.configure({ mode: 'serial' });

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const service = e2eServiceHeaders();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const COLD_ROUTE = { timeout: 15_000 };
const evidence = process.env.ESTA_EVIDENCE_DIR;
const pageFixture = (n: number) => join(repoRoot, 'e2e', 'fixtures', 'pages', `page-${n}.jpg`);
/** Each fixture page's size is its fingerprint: the PDF holds it unchanged, since all three are under 2000 px. */
const PRINTED = new Map([
  ['1200x1600', 1],
  ['1080x1500', 2],
  ['1300x1700', 3],
]);
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const member = (person: 'me' | 'ryan', lane: number) => `household_members?id=eq.${seedId(`seed:member:${person}-lane-${lane}`)}`;

test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });

let worker: AgentWorker | undefined;

test.beforeEach(async ({ request }) => {
  await setClock(request, '2026-10-07T09:00:00+07:00');
});

test.afterAll(async ({ request }) => {
  await worker?.stop();
  await setClock(request, null);
});

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function rest<T>(page: Page, method: 'GET' | 'PATCH', path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { ...service, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (method === 'GET' ? await response.json() : null) as T;
}

type DocumentRow = { id: string; title: string; mime: string; page_count: number; sha256: string; storage_path: string; sensitivity: string };
const liveDocuments = (page: Page, property: string) =>
  rest<DocumentRow[]>(page, 'GET', `documents?property_id=eq.${property}&deleted_at=is.null&select=id,title,mime,page_count,sha256,storage_path,sensitivity&order=created_at.desc`);

/** Archives every document this test added, so a rerun starts from the seed. */
async function cleanUp(page: Page, property: string, seeded: ReadonlySet<string>) {
  for (const row of await liveDocuments(page, property)) {
    if (!seeded.has(row.id)) await rest(page, 'PATCH', `documents?id=eq.${row.id}`, { deleted_at: '2026-10-07T09:00:00+07:00' });
  }
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function shot(page: Page, name: string) {
  if (evidence !== undefined) await page.screenshot({ path: join(evidence, `${name}.png`), animations: 'disabled' });
}

const strip = (page: Page) => page.getByTestId('capture-page');
const stripButton = (page: Page, number: number, name: RegExp | string) =>
  strip(page)
    .nth(number - 1)
    .getByRole('button', { name, exact: typeof name === 'string' });

/** The natural size of each strip photo, top to bottom, once every one has decoded. */
async function stripSizes(page: Page): Promise<string[]> {
  return strip(page)
    .locator('img')
    .evaluateAll(async (images: HTMLImageElement[]) => {
      await Promise.all(images.map((image) => image.decode()));
      return images.map((image) => `${image.naturalWidth}x${image.naturalHeight}`);
    });
}

async function openCapture(page: Page, property: string) {
  await page.goto(`/properties/${property}/documents`);
  await expect(page.getByTestId('add-document'), 'React owns the page').toBeEnabled(COLD_ROUTE);
  await page.getByTestId('add-document').click();
  await page.getByTestId('capture-pages').click();
  await expect(page.getByTestId('multi-page-capture')).toBeVisible();
}

/** One photo at a time through the camera input, as Mẹ takes them. */
async function photograph(page: Page, files: readonly string[]) {
  for (const file of files) {
    const before = await strip(page).count();
    await page.getByTestId('capture-camera-input').setInputFiles(file);
    await expect(strip(page)).toHaveCount(before + 1, { timeout: 15_000 });
  }
}

async function combineAndSave(page: Page, category: string, title: string) {
  await page.getByTestId('combine-pages').click();
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('document-category').selectOption(category);
  await page.getByTestId('document-title').fill(title);
  await page.getByTestId('save-document').click();
  const toast = page.getByRole('region', { name: /Thông báo|Notifications/ }).getByText(title);
  const duplicate = page.getByTestId('duplicate-dialog');
  await expect(toast.or(duplicate)).toBeVisible({ timeout: 30_000 });
  if (await duplicate.isVisible()) await duplicate.getByRole('button').last().click();
  await expect(toast).toBeVisible({ timeout: 30_000 });
}

type PdfPage = { size: string; jpeg: Buffer };

/** The stored PDF's pages in order, each as its one embedded photo. */
async function storedPdf(page: Page, row: DocumentRow): Promise<PdfPage[]> {
  const response = await page.request.get(`${supabaseUrl}/storage/v1/object/documents/${row.storage_path}`, { headers: service });
  expect(response.ok()).toBe(true);
  const pdf = await PDFDocument.load(await response.body());
  return pdf.getPages().map((pdfPage) => {
    const [entry] = pdfPage.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)?.entries() ?? [];
    const image = pdf.context.lookup(entry?.[1]);
    if (!(image instanceof PDFRawStream)) throw new Error('A page holds no photo');
    const dimension = (key: string) => image.dict.lookup(PDFName.of(key), PDFNumber).asNumber();
    return { size: `${dimension('Width')}x${dimension('Height')}`, jpeg: Buffer.from(image.contents) };
  });
}

const printedNumbers = (pages: readonly PdfPage[]) => pages.map((pdfPage) => PRINTED.get(pdfPage.size) ?? pdfPage.size);

/** Rule 1 and its English repeat: three photos, page 3 up one place, combined and saved. */
async function captureReorderSave(page: Page, { lane, title, shots }: { lane: number; title: string; shots?: string }) {
  const property = propertyId(lane, 'bao-loc');
  const seeded = new Set((await liveDocuments(page, property)).map((row) => row.id));
  try {
    await openCapture(page, property);
    await photograph(page, [pageFixture(1), pageFixture(2), pageFixture(3)]);
    await expect(page.getByTestId('capture-page-number')).toHaveText(lane === 10 ? ['Page 1', 'Page 2', 'Page 3'] : ['Trang 1', 'Trang 2', 'Trang 3']);
    expect(await stripSizes(page)).toEqual(['1200x1600', '1080x1500', '1300x1700']);
    await expect(strip(page).first().getByRole('button')).toHaveText(lane === 10 ? ['Up', 'Down', 'Remove'] : ['Lên', 'Xuống', 'Xóa']);
    const clipped = await page
      .getByTestId('upload-sheet')
      .locator('button, [data-testid="capture-page-number"]')
      .evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent));
    expect(clipped, 'no strip text is cut').toEqual([]);
    expect(await page.getByTestId('upload-sheet').evaluate((sheet) => sheet.scrollWidth <= sheet.clientWidth), 'nothing scrolls sideways').toBe(true);
    if (shots !== undefined) await shot(page, `p2-06-strip-${shots}`);
    expect(await seriousAxeViolations(page)).toEqual([]);

    await stripButton(page, 3, lane === 10 ? 'Up' : 'Lên').click();
    expect(await stripSizes(page), 'page 3 now sits second').toEqual(['1200x1600', '1300x1700', '1080x1500']);
    await expect(stripButton(page, 2, lane === 10 ? 'Up' : 'Lên'), 'focus stays on the page that moved').toBeFocused();

    await combineAndSave(page, 'lease_contract', title);
    const [row] = await liveDocuments(page, property);
    expect(row).toMatchObject({ title, mime: 'application/pdf', page_count: 3 });
    const pages = await storedPdf(page, row as DocumentRow);
    expect(printedNumbers(pages), 'the PDF reads 1, 3, 2 (DOC-2)').toEqual([1, 3, 2]);
    return { property, row: row as DocumentRow, seeded };
  } catch (error) {
    await cleanUp(page, property, seeded);
    throw error;
  }
}

test('rule 1: Mẹ photographs three pages, moves page 3 up, and the saved PDF reads 1, 3, 2 with page_count 3 (DOC-2)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const { property, row, seeded } = await captureReorderSave(page, { lane: 1, title: 'Hợp đồng ba trang', shots: '390x844-light' });
  try {
    await page.goto(`/documents/${row.id}`);
    await expect(page.getByTestId('document-meta')).toContainText('3 trang', COLD_ROUTE);
    await expect(page.locator('canvas[data-testid="document-page"]')).toHaveAttribute('data-drawn', 'true', COLD_ROUTE);
    await page.getByRole('tab', { name: 'Trang 2', exact: true }).click();
    await expect(page.locator('canvas[data-testid="document-page"]')).toHaveAttribute('data-drawn', 'true', COLD_ROUTE);
    await shot(page, 'p2-06-combined-390x844-light');
  } finally {
    await cleanUp(page, property, seeded);
  }
});

test('rule 2: Ryan picks three photos at once, removes page 2, tabs through every strip button and saves 2 pages', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'ryan.lane2@demo.esta.test', 'light', DESKTOP);
  const property = propertyId(2, 'bao-loc');
  const seeded = new Set((await liveDocuments(page, property)).map((row) => row.id));
  try {
    await openCapture(page, property);
    await page.getByTestId('capture-files-input').setInputFiles([pageFixture(1), pageFixture(2), pageFixture(3)]);
    await expect(strip(page)).toHaveCount(3, { timeout: 15_000 });
    await shot(page, 'p2-06-strip-1440x900-light');
    await stripButton(page, 2, 'Xóa').click();
    await expect(page.getByTestId('capture-page-number')).toHaveText(['Trang 1', 'Trang 2']);
    expect(await stripSizes(page)).toEqual(['1200x1600', '1300x1700']);

    await page.getByTestId('capture-files-input').focus();
    const reached: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(() => {
          const focused = document.activeElement;
          const item = focused?.closest('[data-testid="capture-page"]');
          const number = item?.querySelector('[data-testid="capture-page-number"]')?.textContent ?? '';
          return `${number} ${focused?.textContent ?? ''}`;
        }),
      );
    }
    expect(reached, 'keyboard focus reaches every strip button in order').toEqual(['Trang 1 Lên', 'Trang 1 Xuống', 'Trang 1 Xóa', 'Trang 2 Lên', 'Trang 2 Xuống', 'Trang 2 Xóa']);

    await combineAndSave(page, 'lease_contract', 'Hợp đồng hai trang');
    const [row] = await liveDocuments(page, property);
    expect(row).toMatchObject({ title: 'Hợp đồng hai trang', page_count: 2 });
    expect(printedNumbers(await storedPdf(page, row as DocumentRow))).toEqual([1, 3]);
  } finally {
    await cleanUp(page, property, seeded);
  }
});

test('rule 3: leaving with three pages taken asks Bỏ 3 trang đã chụp?, and keeping them keeps the strip', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await openCapture(page, propertyId(3, 'bao-loc'));
  await photograph(page, [pageFixture(1), pageFixture(2), pageFixture(3)]);
  await shot(page, 'p2-06-strip-390x844-dark');

  await page.getByTestId('capture-back').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading')).toHaveText('Bỏ 3 trang đã chụp?');
  await expect(confirm.getByTestId('keep-pages')).toBeFocused();
  await shot(page, 'p2-06-leave-confirm-390x844-dark');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await confirm.getByTestId('keep-pages').click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('capture-page-number')).toHaveText(['Trang 1', 'Trang 2', 'Trang 3']);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog').getByRole('heading'), 'closing the sheet asks too').toHaveText('Bỏ 3 trang đã chụp?');
  await page.getByTestId('discard-pages').click();
  await expect(page.getByTestId('upload-sheet')).toBeHidden();
});

/** The photo recording replays its model turns for this PDF's bytes; the tools still read the file and save for real. */
function replayDirFor(sha256: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'esta-multipage-replay-'));
  const source = join(repoRoot, 'fixtures', 'agent-replay');
  cpSync(source, dir, { recursive: true });
  const kind = join(source, 'extract_document');
  const [recordingFile] = readdirSync(kind).filter((name) => JSON.parse(readFileSync(join(kind, name), 'utf8')).label === 'gcn_2009_2024-photo');
  const recording = JSON.parse(readFileSync(join(kind, recordingFile ?? ''), 'utf8')) as { input: CanonicalInput; inputHash: string; label: string };
  const input = { ...recording.input, prompt: recording.input.prompt.replace(/SHA-256 is [0-9a-f]{64}/, `SHA-256 is ${sha256}`) };
  const hash = inputHash(input);
  mkdirSync(join(dir, 'extract_document'), { recursive: true });
  writeFileSync(join(dir, 'extract_document', `${hash}.json`), JSON.stringify({ ...recording, input, inputHash: hash, label: 'gcn_2009_2024-photo captured' }));
  return dir;
}

test('rule 4: the Dĩ An certificate photographed page by page is blurred and reaches Chờ xem lại with one extraction', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  const property = propertyId(4, 'di-an');
  const seeded = new Set((await liveDocuments(page, property)).map((row) => row.id));
  const photos = [1, 2, 3].map((n) => join(repoRoot, 'fixtures', 'certificates', 'gcn_2009_2024-photo', `page-${n}.jpg`));
  try {
    await openCapture(page, property);
    await page.getByTestId('capture-files-input').setInputFiles(photos);
    await expect(strip(page)).toHaveCount(3, { timeout: 15_000 });
    await page.getByTestId('combine-pages').click();
    await expect(page.getByTestId('upload-preview')).toHaveAttribute('data-blurred', 'true', { timeout: 30_000 });
    await expect(page.getByTestId('document-category')).toHaveValue('certificate');
    await page.getByTestId('document-title').fill('Sổ hồng Dĩ An chụp');
    await page.getByTestId('save-document').click();
    await expect(page.getByRole('region', { name: /Thông báo/ }).getByText('Sổ hồng Dĩ An chụp')).toBeVisible({ timeout: 30_000 });

    const [row] = await liveDocuments(page, property);
    expect(row).toMatchObject({ title: 'Sổ hồng Dĩ An chụp', page_count: 3, sensitivity: 'sensitive' });
    // The replay key holds the file's SHA-256, which exists only once the browser has built the PDF.
    worker = await startAgentWorker({ replayDir: replayDirFor(row?.sha256 ?? '') });
    const tile = page.locator(`[data-testid="document-tile"][data-document-id="${row?.id}"]`);
    await expect(tile).toHaveAttribute('data-blurred', 'true');
    await expect(tile.getByTestId('extraction-status')).toHaveText('Chờ xem lại', { timeout: 20_000 });
    const extractions = await rest<{ status: string }[]>(page, 'GET', `document_extractions?document_id=eq.${row?.id}&select=status`);
    expect(extractions).toEqual([{ status: 'needs_review' }]);
  } finally {
    await worker?.stop();
    worker = undefined;
    await cleanUp(page, property, seeded);
  }
});

test('rule 5: at 4x CPU slowdown an EXIF-rotated photo lands upright, and 21 more photos stop at 20 pages', async ({ page }) => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(join(tmpdir(), 'esta-multipage-'));
  const rotated = join(dir, 'rotated.jpg');
  // Stored a quarter turn left with orientation 6, as a phone held upright saves it: shown upright it is page 1.
  await sharp(pageFixture(1)).rotate(-90).withMetadata({ orientation: 6 }).jpeg().toFile(rotated);
  const many = await Promise.all(
    Array.from({ length: 21 }, async (_, n) => {
      const file = join(dir, `extra-${n + 1}.jpg`);
      await sharp({ create: { width: 400, height: 560, channels: 3, background: { r: 240 - n * 5, g: 230, b: 210 } } })
        .jpeg()
        .toFile(file);
      return file;
    }),
  );

  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  const property = propertyId(5, 'bao-loc');
  const seeded = new Set((await liveDocuments(page, property)).map((row) => row.id));
  const cdp = await page.context().newCDPSession(page);
  try {
    await openCapture(page, property);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await photograph(page, [rotated]);
    expect(await stripSizes(page), 'the strip shows the photo upright').toEqual(['1200x1600']);
    await page.getByTestId('capture-files-input').setInputFiles(many);
    await expect(strip(page)).toHaveCount(20, { timeout: 60_000 });
    await expect(page.getByTestId('capture-status')).toHaveText('Tối đa 20 trang mỗi tài liệu.');
    await expect(page.getByTestId('capture-camera-input')).toBeDisabled();
    await shot(page, 'p2-06-page-cap-390x844-light');

    await combineAndSave(page, 'lease_contract', 'Hợp đồng hai mươi trang');
    const [row] = await liveDocuments(page, property);
    expect(row?.page_count).toBe(20);
    const [first, ...rest] = await storedPdf(page, row as DocumentRow);
    expect(rest).toHaveLength(19);
    expect(first?.size, 'page 1 is portrait, as the paper stands').toBe('1200x1600');
    const { data, info } = await sharp(first?.jpeg).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    const [headerRed = 0, , headerBlue = 0] = pixel(info.width / 2 - 300, 20);
    const [, , footBlue = 0] = pixel(info.width / 2, info.height - 20);
    expect(headerBlue - headerRed, 'the blue header is at the top, so the printed number reads the right way up').toBeGreaterThan(80);
    expect(footBlue, 'the paper at the bottom').toBeGreaterThan(200);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cleanUp(page, property, seeded);
  }
});

test('a capture opened offline says the pages were not combined, and Gộp thành PDF works once back online', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const property = propertyId(6, 'bao-loc');
  const seeded = new Set((await liveDocuments(page, property)).map((row) => row.id));
  try {
    await page.goto(`/properties/${property}/documents`);
    await expect(page.getByTestId('add-document')).toBeEnabled(COLD_ROUTE);
    await page.getByTestId('add-document').click();
    await expect(page.getByTestId('capture-pages')).toBeVisible();
    await page.context().setOffline(true);
    await page.getByTestId('capture-pages').click();
    await photograph(page, [pageFixture(1), pageFixture(2)]);
    await page.getByTestId('combine-pages').click();
    await expect(page.getByTestId('capture-error')).toHaveText('Chưa gộp được các trang. Kiểm tra kết nối mạng rồi bấm Gộp thành PDF lần nữa.');
    await expect(page.getByTestId('capture-page-number'), 'the pages stay for the retry').toHaveText(['Trang 1', 'Trang 2']);
    await shot(page, 'p2-06-combine-error-390x844-light');

    await page.context().setOffline(false);
    await page.getByTestId('combine-pages').click();
    await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  } finally {
    await page.context().setOffline(false);
    await cleanUp(page, property, seeded);
  }
});

test('rule 6: in English at 130% and dark the strip buttons read in English, none is cut, and the PDF has 3 pages', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', member('me', 10), { locale: 'en', text_scale: 130 });
  try {
    const { property, row, seeded } = await captureReorderSave(page, { lane: 10, title: 'Three page lease' });
    await cleanUp(page, property, seeded);
    expect(row.page_count).toBe(3);
  } finally {
    await rest(page, 'PATCH', member('me', 10), { locale: 'vi', text_scale: 100 });
  }
});
