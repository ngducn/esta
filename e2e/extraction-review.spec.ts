import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { needsCheck } from '../packages/core/src/extraction/confidence.ts';
import { reviewFields } from '../packages/core/src/extraction/fields.ts';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { CRAFTED, extractionFixtures, type UploadFile } from '../fixtures/certificates/generator/uploads.tsx';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { signIn } from './helpers/inbucket';
import { setClock } from './helpers/test-clock';

// One worker and one test clock per slot, so the rules run in order in the `clock` project.
test.describe.configure({ mode: 'serial' });

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false });
const rest = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const service = e2eServiceHeaders();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const START = '2026-10-07T09:00:00+07:00';
const evidence = process.env.ESTA_EVIDENCE_DIR;

test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });

function fixture(id: string) {
  const found = extractionFixtures().find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const userOf = (person: 'me' | 'ryan', lane: number) => seedId(`seed:user:${person}-lane-${lane}`);

let worker: AgentWorker | undefined;

test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

async function startWorker() {
  await worker?.stop();
  worker = await startAgentWorker();
}

async function stopWorker() {
  await worker?.stop();
  worker = undefined;
}

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

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function shot(page: Page, name: string) {
  if (evidence === undefined) return;
  const pager = page.getByTestId('document-pager');
  if ((await pager.count()) > 0 && (await pager.isVisible())) {
    await expect(pager.locator('[data-testid="document-page"]:not([data-drawn="false"])')).toBeVisible({ timeout: 15_000 });
  }
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
}

/** Uploads through the sheet and returns the new document's id. */
async function upload(page: Page, file: UploadFile, { category, title }: { category: string; title: string }): Promise<string> {
  const before = Date.now();
  await page.getByTestId('add-document').click();
  await page.getByTestId('camera-input').setInputFiles(file);
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('document-category').selectOption(category);
  await page.getByTestId('document-title').fill(title);
  await page.getByTestId('save-document').click();
  const toast = page.getByRole('region', { name: /Thông báo|Notifications/ }).getByText(new RegExp(title));
  const duplicate = page.getByTestId('duplicate-dialog');
  await expect(toast.or(duplicate)).toBeVisible({ timeout: 30_000 });
  // Lane households seed some fixture pages as documents, so the same bytes may already be there.
  if (await duplicate.isVisible()) await duplicate.getByRole('button').last().click();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const [row] = await serviceGet<{ id: string; created_at: string }[]>(
    page,
    `documents?title=eq.${encodeURIComponent(title)}&select=id,created_at&order=created_at.desc&limit=1`,
  );
  expect(Date.parse(row?.created_at ?? '') >= before - 60_000, 'the newest document with that title is this upload').toBe(true);
  return row?.id ?? '';
}

const pill = (page: Page, documentId: string) => page.locator(`[data-testid="document-tile"][data-document-id="${documentId}"] [data-testid="extraction-status"]`);

type Extraction = { id: string; status: string; model: string | null; result: unknown; accepted_fields: Record<string, { decision: string; value: unknown }> | null };
const extractions = (page: Page, documentId: string) =>
  serviceGet<Extraction[]>(page, `document_extractions?document_id=eq.${documentId}&select=id,status,model,result,accepted_fields&order=created_at.desc`);

/** Uploads a fixture with the replay worker running and waits for `Chờ xem lại` on its tile. */
async function uploadAndRead(page: Page, lane: number, key: string, fixtureId: string, title: string, category = 'certificate') {
  await page.goto(`/properties/${propertyId(lane, key)}/documents`);
  const documentId = await upload(page, await fixture(fixtureId).upload(), { category, title });
  await expect(pill(page, documentId)).toHaveText(/^(Chờ xem lại|Ready for review)$/, { timeout: 15_000 });
  return documentId;
}

const rows = (page: Page) => page.getByTestId('extraction-field');
const row = (page: Page, path: string) => page.locator(`[data-testid="extraction-field"][data-path="${path}"]`);

async function acceptEvery(page: Page) {
  const count = await rows(page).count();
  for (let index = 0; index < count; index += 1) {
    const current = rows(page).nth(index);
    if ((await current.getAttribute('data-decision')) === 'none') await current.getByTestId('field-correct').click();
  }
  await expect(page.locator('[data-testid="extraction-field"][data-decision="none"]')).toHaveCount(0);
}

async function editField(page: Page, path: string, text: string) {
  await row(page, path).getByTestId('field-edit').click();
  const input = row(page, path).getByTestId('field-input');
  await input.fill('');
  await input.pressSequentially(text);
  await row(page, path).getByTestId('field-done').click();
}

/** The reviewed fields the recording read below 0.9, the count of `kiểm tra lại` marks the page must show. */
function lowConfidence(result: unknown): number {
  return reviewFields('certificate_v1', result).filter((field) => needsCheck(field)).length;
}

/** Lưu on another property's certificate stops once on the rows that do not match, and Vẫn lưu saves it (#356). */
async function saveAnyway(page: Page) {
  await page.getByTestId('review-submit').click();
  await expect(page.getByTestId('review-submit')).toHaveAttribute('data-state', 'confirm', { timeout: 15_000 });
  await page.getByTestId('review-submit').click();
}

async function expectMarks(page: Page, result: unknown) {
  const marks = page.getByTestId('needs-check');
  await expect(marks).toHaveCount(lowConfidence(result));
  for (const mark of await marks.all()) {
    await expect(mark.locator('svg')).toBeVisible();
    await expect(mark).toHaveText(/kiểm tra lại|check again/);
  }
}

test('rule 1: Mẹ opens Chờ xem lại on the Dĩ An certificate, sees every low-confidence field marked and the address it replaces, accepts all and Pháp lý shows the serial and parcel', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const documentId = await uploadAndRead(page, 1, 'di-an', 'northstar-di-an', 'Sổ hồng Dĩ An');
  await pill(page, documentId).getByTestId('review-link').click();
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  const [extraction] = await extractions(page, documentId);
  expect(lowConfidence(extraction?.result), 'the recording reads some fields below 0.9').toBeGreaterThan(0);
  await expect(page.getByTestId('document-page')).toBeVisible();
  const imageBox = await page.getByTestId('document-pager').boundingBox();
  const firstField = await rows(page).first().boundingBox();
  expect(imageBox !== null && firstField !== null && imageBox.y + imageBox.height <= firstField.y, 'on a phone the image sits above the fields').toBe(true);
  await expectMarks(page, extraction?.result);
  await shot(page, 'p2-07-rule1-review-390x844-light');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await expect(page.getByTestId('review-change')).toHaveCount(0);
  await acceptEvery(page);
  await expect(page.getByTestId('change-before')).toHaveText('Số 903/9 Demo, đường Nguyễn An Ninh, Khu phố Nhị Đồng 2, Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương');
  await expect(page.getByTestId('change-after')).toHaveText('phường Dĩ An, thành phố Dĩ An, tỉnh Bình Dương');
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(1, 'di-an')}/legal`, { timeout: 15_000 });
  const truth = fixture('northstar-di-an').truth as { serial_no: { value: string }; parcels: { parcel_no: { value: string } }[] };
  await expect(page.getByText(truth.serial_no.value).first()).toBeVisible();
  for (const parcel of truth.parcels) await expect(page.getByText(new RegExp(`Thửa số ${parcel.parcel_no.value}\\b`)).first()).toBeVisible();
  expect((await extractions(page, documentId))[0]?.status).toBe('accepted');
});

test('rule 1b: the Thủ Đức certificate filed on Đất vườn Long An stops at Lưu on the rows that do not match, writes nothing, and saves on Vẫn lưu (#356)', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const before = 'Thửa đất số 906 Demo, tờ bản đồ số 96, Phường 2, Thành phố Tân An, Tỉnh Long An';
  const documentId = await uploadAndRead(page, 1, 'long-an', 'gcn_2024-photo', 'Sổ hồng Long An');
  await page.goto(`/documents/${documentId}/review`);
  await acceptEvery(page);
  await expect(page.getByTestId('change-before')).toHaveText(before);
  await expect(page.getByTestId('change-after')).toHaveText('phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh');
  await page.getByTestId('review-submit').click();

  await expect(page.getByTestId('review-error')).toHaveText(
    'Giấy này có thể là của bất động sản khác: tỉnh hoặc người đứng tên không khớp. Xem lại các dòng được đánh dấu. Nếu đúng là giấy của bất động sản này, bấm Vẫn lưu.',
  );
  for (const path of ['parcels[0].address_text', 'holders[0].full_name', 'holders[1].full_name']) {
    await expect(row(page, path).getByTestId('field-error'), path).toHaveText('Không khớp với bất động sản này.');
  }
  await expect(page.getByTestId('review-submit')).toHaveAttribute('data-state', 'confirm');
  await expect(page.getByTestId('review-submit')).toHaveText('Vẫn lưu');
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  const [waiting] = await extractions(page, documentId);
  expect(waiting?.status, 'nothing is accepted before Vẫn lưu').toBe('needs_review');
  expect(await serviceGet(page, `certificates?extraction_id=eq.${waiting?.id}&select=id`)).toEqual([]);
  expect(await serviceGet(page, `properties?id=eq.${propertyId(1, 'long-an')}&select=certificate_address_text`)).toEqual([{ certificate_address_text: before }]);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(1, 'long-an')}/legal`, { timeout: 15_000 });
  await expect(page.getByText('AA 01234567').first()).toBeVisible();
  expect((await extractions(page, documentId))[0]?.status).toBe('accepted');
});

test('rule 2: an edited area of 125,5 saves as 125.5, a CCCD typed into the issuer saves as typed (D11), and a second Lưu after a cut response leaves one certificate', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane2@demo.esta.test', 'dark', PHONE);
  const documentId = await uploadAndRead(page, 2, 'bao-loc', 'gcn_2024-scan', 'Sổ hồng lane 2');
  const views = () => serviceGet<unknown[]>(page, `document_access_log?select=id&document_id=eq.${documentId}&action=eq.view`);
  const before = (await views()).length;
  await page.goto(`/documents/${documentId}/review`);
  await expect(page.locator('[data-testid="document-page"][data-drawn="true"]')).toBeVisible({ timeout: 15_000 });
  expect((await views()).length, 'opening the review logs one view').toBe(before + 1);
  await acceptEvery(page);
  const issuer = 'Sở TN&MT Demo, CCCD 079184001776';
  await editField(page, 'issued_by', issuer);
  await expect(row(page, 'issued_by').getByTestId('field-value')).toHaveText(issuer);
  await editField(page, 'parcels[0].area_m2', '125,5');
  await expect(row(page, 'parcels[0].area_m2').getByTestId('field-value')).toHaveText('125,5 m²');
  await expect(page.getByTestId('area-mismatch')).toBeVisible();

  await page.getByTestId('review-submit').click();
  await expect(page.getByTestId('review-submit')).toHaveAttribute('data-state', 'confirm');
  let cut = false;
  await page.route(`**/documents/${documentId}/review`, async (route) => {
    if (route.request().method() !== 'POST' || cut) return route.continue();
    cut = true;
    await route.fetch();
    await route.abort('connectionreset');
  });
  await page.getByTestId('review-submit').click();
  await expect(page.getByTestId('review-error')).toHaveText('Chưa lưu được. Bấm Lưu để thử lại.');
  await shot(page, 'p2-07-rule2-save-error-390x844-dark');
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(2, 'bao-loc')}/legal`, { timeout: 15_000 });

  const [extraction] = await extractions(page, documentId);
  expect(extraction?.accepted_fields?.['parcels[0].area_m2']).toEqual({ decision: 'edited', value: 125.5 });
  expect(extraction?.accepted_fields?.issued_by).toEqual({ decision: 'edited', value: issuer });
  const certificates = await serviceGet<{ id: string; issued_by: string }[]>(page, `certificates?extraction_id=eq.${extraction?.id}&select=id,issued_by`);
  expect(certificates).toEqual([{ id: expect.any(String), issued_by: issuer }]);
  const parcels = await serviceGet<{ area_m2: number }[]>(page, `parcels?certificate_id=eq.${certificates[0]?.id}&select=area_m2`);
  const truth = fixture('gcn_2024-scan').truth as { parcels: unknown[] };
  expect(parcels).toHaveLength(truth.parcels.length);
  expect(parcels[0]?.area_m2).toBe(125.5);
});

test('rule 3: Ryan accepts a certificate held by Nguyễn Thị Demo; her party is reused and the history names him alone', async ({ page }) => {
  await startWorker();
  await open(page, 'ryan.lane3@demo.esta.test', 'light', DESKTOP);
  const household = seedId('seed:household:lane-3');
  const partiesBefore = await serviceGet<unknown[]>(page, `parties?household_id=eq.${household}&select=id`);
  const documentId = await uploadAndRead(page, 3, 'di-an', 'northstar-di-an', 'Sổ hồng Dĩ An lane 3');
  await page.goto(`/documents/${documentId}/review`);
  await expect(rows(page).first()).toBeVisible();
  const imageBox = await page.getByTestId('document-pager').boundingBox();
  const firstField = await rows(page).first().boundingBox();
  expect(imageBox !== null && firstField !== null && imageBox.x + imageBox.width <= firstField.x, 'on a desktop the image sits left of the fields').toBe(true);
  await shot(page, 'p2-07-rule3-review-1440x900-light');
  await acceptEvery(page);
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(3, 'di-an')}/legal`, { timeout: 15_000 });

  const [extraction] = await extractions(page, documentId);
  expect(await serviceGet<unknown[]>(page, `parties?household_id=eq.${household}&select=id`)).toHaveLength(partiesBefore.length);
  const [certificate] = await serviceGet<{ id: string; holder_party_ids: string[] }[]>(page, `certificates?extraction_id=eq.${extraction?.id}&select=id,holder_party_ids`);
  expect(certificate?.holder_party_ids).toEqual([seedId('seed:party:me-lane-3')]);
  const parcels = await serviceGet<{ id: string }[]>(page, `parcels?certificate_id=eq.${certificate?.id}&select=id`);
  const audit = await serviceGet<{ actor_kind: string; actor_id: string }[]>(
    page,
    `audit_log?row_id=in.(${[certificate?.id, ...parcels.map((parcel) => parcel.id)].join(',')})&select=actor_kind,actor_id`,
  );
  expect(audit.length).toBeGreaterThan(0);
  expect(audit.every((entry) => entry.actor_kind === 'user' && entry.actor_id === userOf('ryan', 3))).toBe(true);
});

test('rule 4: a blank page the assistant cannot read is entered by hand beside its image and saves a parcel', async ({ page, request }) => {
  await startWorker();
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/properties/${propertyId(4, 'bao-loc')}/documents`);
  const documentId = await upload(page, await CRAFTED['blank-page'].upload(), { category: 'certificate', title: 'Trang trống lane 4' });
  const [queued] = await extractions(page, documentId);
  const jobOf = async () => (await serviceGet<{ status: string; attempts: number }[]>(page, `agent_jobs?payload->>extraction_id=eq.${queued?.id}&select=status,attempts`))[0];
  for (const [attempts, next] of [
    [1, '2026-10-07T09:02:00+07:00'],
    [2, '2026-10-07T09:08:00+07:00'],
    [3, '2026-10-07T09:34:00+07:00'],
  ] as const) {
    await expect.poll(jobOf, { timeout: 10_000 }).toEqual({ status: 'queued', attempts });
    await setClock(request, next);
  }
  await expect.poll(jobOf, { timeout: 10_000 }).toEqual({ status: 'failed', attempts: 4 });
  await page.reload();
  await pill(page, documentId).getByTestId('review-link').click();
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  await expect(page.getByTestId('review-intro')).toContainText('Trợ lý không đọc được');
  await expect(page.getByTestId('needs-check')).toHaveCount(0);
  for (const value of await page.getByTestId('field-value').all()) await expect(value).toHaveText('Trống');
  const imageBox = await page.getByTestId('document-pager').boundingBox();
  const firstField = await rows(page).first().boundingBox();
  expect(imageBox !== null && firstField !== null && imageBox.x + imageBox.width <= firstField.x, 'the empty rows sit beside the image').toBe(true);
  await shot(page, 'p2-07-rule4-manual-1440x900-dark');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await row(page, 'form').getByTestId('field-edit').click();
  await row(page, 'form').locator('select').selectOption('paper_only');
  await row(page, 'form').getByTestId('field-done').click();
  await editField(page, 'parcels[0].parcel_no', '12');
  await editField(page, 'parcels[0].area_m2', '300');
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(4, 'bao-loc')}/legal`, { timeout: 15_000 });

  const [manual] = await extractions(page, documentId);
  expect(manual).toMatchObject({ status: 'accepted', model: null });
  const [certificate] = await serviceGet<{ id: string }[]>(page, `certificates?extraction_id=eq.${manual?.id}&select=id`);
  expect(await serviceGet(page, `parcels?certificate_id=eq.${certificate?.id}&select=parcel_no,area_m2`)).toEqual([{ parcel_no: '12', area_m2: 300 }]);
});

test('rule 5: with the worker offline the review names the last heartbeat, and the fields appear without a reload once it starts', async ({ page, request }) => {
  await stopWorker();
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${propertyId(5, 'bao-loc')}/documents`);
  const documentId = await upload(page, await fixture('gcn_2009_2024-photo').upload(), { category: 'certificate', title: 'Sổ hồng lane 5' });
  await page.goto(`/documents/${documentId}/review`);
  await expect(page.getByTestId('review-reading')).toHaveText('Trợ lý đang đọc tài liệu.');

  const [beat] = await serviceGet<{ last_seen_at: string }[]>(page, 'worker_heartbeats?select=last_seen_at&order=last_seen_at.desc&limit=1');
  const lastBeat = Math.max(Date.parse(beat?.last_seen_at ?? ''), Date.parse(START));
  await setClock(request, new Date(lastBeat + 6 * 60_000).toISOString());
  await page.reload();
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(lastBeat);
  await expect(page.getByTestId('review-offline')).toContainText(`Trợ lý ngoại tuyến từ ${time}`);
  await shot(page, 'p2-07-rule5-offline-390x844-light');

  await page.evaluate(() => Object.assign(window, { stayedOnPage: true }));
  await startWorker();
  await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { stayedOnPage?: boolean }).stayedOnPage), 'the fields came without a reload').toBe(true);
});

test('rule 6: an accepted electricity bill puts its customer code and provider on the Cho thuê tab', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane6@demo.esta.test', 'dark', PHONE);
  const documentId = await uploadAndRead(page, 6, 'q7', 'electricity-q7-scan', 'Hóa đơn điện lane 6', 'utility_bill');
  await page.goto(`/documents/${documentId}/review`);
  await acceptEvery(page);
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(`/properties/${propertyId(6, 'q7')}/rental`, { timeout: 15_000 });
  const truth = fixture('electricity-q7-scan').truth as { customer_code: { value: string }; provider: { value: string } };
  // Nhà phố Q7 already holds this electricity account, so accepting the bill reuses it rather than adding a second.
  const account = page.getByTestId('account-row').filter({ hasText: truth.customer_code.value });
  await expect(account.getByTestId('customer-code')).toHaveText(truth.customer_code.value);
  await expect(account).toContainText(new RegExp(truth.provider.value, 'i'));
  expect(await serviceGet(page, `utility_accounts?property_id=eq.${propertyId(6, 'q7')}&customer_code=eq.${truth.customer_code.value}&select=id`)).toHaveLength(1);
  expect((await extractions(page, documentId))[0]?.status).toBe('accepted');
});

test('rule 7: in English at 130% and dark, labels read in English, values keep their diacritics, and nothing scrolls sideways', async ({ page }) => {
  await startWorker();
  const member = `household_members?invited_email=eq.${encodeURIComponent('me.lane10@demo.esta.test')}`;
  const patch = (data: unknown) => page.request.patch(`${rest}/${member}`, { headers: { ...service, 'content-type': 'application/json' }, data });
  expect((await patch({ locale: 'en', text_scale: 130 })).ok()).toBe(true);
  try {
    await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
    const documentId = await uploadAndRead(page, 10, 'long-an', 'gcn_2024-photo', 'Sổ hồng Long An lane 10');
    await page.goto(`/documents/${documentId}/review`);
    const [extraction] = await extractions(page, documentId);
    await expectMarks(page, extraction?.result);
    await expect(page.getByRole('heading', { name: 'Holder 2' })).toBeVisible();
    await expect(rows(page).first().getByTestId('field-correct')).toHaveText('Correct');
    const holder = row(page, 'holders[1].full_name').getByTestId('field-value');
    await expect(holder).toHaveText('Huỳnh Ngọc Demo Thảo');
    expect(await holder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot(page, 'p2-07-rule7-review-en-130-390x844-dark');
    await acceptEvery(page);
    await saveAnyway(page);
    await expect(page).toHaveURL(`/properties/${propertyId(10, 'long-an')}/legal`, { timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await patch({ locale: 'vi', text_scale: 100 });
  }
});

test('rule 8: page 1 opens from its review copy, and the full file loads only when Mẹ zooms in or turns the page (SPEC §7.2)', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'light', PHONE);
  const documentId = (key: string) => seedId(`seed:document:lane-9:${key}`);
  const files: string[] = [];
  page.on('request', (request) => {
    if (/\/storage\/v1\/object\/sign\/documents\/[^?]+\/(so-hong-pre2009-photo-page-1\.jpg|hop-dong-thue-thu-duc\.pdf)\?/.test(request.url())) files.push(request.url());
  });
  const pageImage = page.locator('img[data-testid="document-page"][data-drawn="true"]');

  await page.goto(`/documents/${documentId('q7:certificate')}/review`);
  await expect(pageImage).toHaveAttribute('src', /\/review\.webp\?token=/);
  expect(files, 'the photo itself waits for a zoom').toEqual([]);
  await page.getByTestId('zoom-in').click();
  await expect.poll(() => files.length, { message: 'zooming in fetches the full-size photo' }).toBeGreaterThan(0);
  await expect(page.locator('img[src*="/so-hong-pre2009-photo-page-1.jpg?token="]')).toBeVisible();

  files.length = 0;
  await page.goto(`/documents/${documentId('thu-duc:lease')}/review`);
  await expect(pageImage).toHaveAttribute('src', /\/review\.webp\?token=/);
  await expect(page.getByTestId('page-tab')).toHaveCount(2);
  expect(files, 'the PDF and pdf.js wait for a page turn').toEqual([]);
  await page.getByTestId('page-tab').nth(1).click();
  await expect(page.locator('canvas[data-testid="document-page"][data-drawn="true"]')).toBeVisible({ timeout: 15_000 });
  expect(files.length, 'turning to page 2 fetches the PDF').toBeGreaterThan(0);
});

test('main flow: Mẹ opens the waiting review from the Trợ lý item, fixes the field marked kiểm tra lại, accepts, and Pháp lý shows the parcel', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  const documentId = await uploadAndRead(page, 7, 'long-an', 'gcn_2024-photo', 'Sổ hồng Long An lane 7');
  await page.goto('/assistant');
  const item = page.getByTestId('inbox-item').filter({ hasText: 'Đã đọc xong Sổ hồng Long An lane 7. Mời bạn kiểm tra lại.' });
  await item.first().getByTestId('item-review').click();
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  const marked = page.locator('[data-testid="extraction-field"][data-needs-check="true"]').first();
  const path = (await marked.getAttribute('data-path')) ?? '';
  await marked.getByTestId('field-page').click();
  const read = (await marked.getByTestId('field-value').textContent()) ?? '';
  await editField(page, path, read.replace(/\s*m²$/u, ''));
  await expect(marked).toHaveAttribute('data-decision', 'edited');
  await acceptEvery(page);
  await saveAnyway(page);
  await expect(page).toHaveURL(`/properties/${propertyId(7, 'long-an')}/legal`, { timeout: 15_000 });
  await expect(page.getByText(/Thửa số 56\b/).first()).toBeVisible();
  await page.goto('/assistant');
  await expect(page.locator(`[data-testid="inbox-item"]:has(a[href="/documents/${documentId}/review"])`), 'once reviewed the note folds to one muted line with no review link').toHaveCount(0);
});

test('evidence: every state at 390x844 and 1440x900, light and dark', async ({ page, request }) => {
  test.skip(evidence === undefined, 'screenshots only when ESTA_EVIDENCE_DIR is set');
  test.setTimeout(600_000);
  await startWorker();
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  const review = await uploadAndRead(page, 8, 'long-an', 'gcn_2024-photo', 'Sổ hồng Long An lane 8');
  await stopWorker();
  await page.goto(`/properties/${propertyId(8, 'long-an')}/documents`);
  const reading = await upload(page, await fixture('gcn_2009_2024-scan').upload(), { category: 'certificate', title: 'Sổ hồng đang đọc lane 8' });
  const failed = await upload(page, await fixture('paper_only-photo').upload(), { category: 'certificate', title: 'Giấy tay lane 8' });
  const [queued] = await extractions(page, failed);
  expect((await page.request.patch(`${rest}/document_extractions?id=eq.${queued?.id}`, { headers: { ...service, 'content-type': 'application/json' }, data: { status: 'failed' } })).ok()).toBe(true);
  const member = `household_members?invited_email=eq.${encodeURIComponent('me.lane8@demo.esta.test')}`;
  const role = (value: string) => page.request.patch(`${rest}/${member}`, { headers: { ...service, 'content-type': 'application/json' }, data: { role: value } });
  const [beat] = await serviceGet<{ last_seen_at: string }[]>(page, 'worker_heartbeats?select=last_seen_at&order=last_seen_at.desc&limit=1');
  const offlineAt = new Date(Math.max(Date.parse(beat?.last_seen_at ?? ''), Date.parse(START)) + 6 * 60_000).toISOString();
  const combos = [PHONE, DESKTOP].flatMap((viewport) => (['light', 'dark'] as const).map((theme) => ({ viewport, theme, name: `${viewport.width}x${viewport.height}-${theme}` })));
  const theme = async (value: 'light' | 'dark') => page.context().addCookies([{ name: 'esta_theme', value, url: test.info().project.use.baseURL ?? '' }]);

  for (const combo of combos) {
    await page.setViewportSize(combo.viewport);
    await theme(combo.theme);
    await setClock(request, START);
    await page.goto(`/documents/${reading}/review`);
    await expect(page.getByTestId('review-reading')).toBeVisible();
    await shot(page, `p2-07-reading-${combo.name}`);
    await setClock(request, offlineAt);
    await page.reload();
    await expect(page.getByTestId('review-offline')).toBeVisible();
    await shot(page, `p2-07-offline-${combo.name}`);
    await setClock(request, START);

    await page.goto(`/documents/${review}/review`);
    await expect(page.getByTestId('needs-check').first()).toBeVisible();
    await shot(page, `p2-07-review-${combo.name}`);
    await row(page, 'parcels[0].area_m2').getByTestId('field-edit').click();
    await row(page, 'parcels[0].area_m2').getByTestId('field-input').fill('125,5');
    await shot(page, `p2-07-edit-area-${combo.name}`);
    await row(page, 'parcels[0].area_m2').getByTestId('field-done').click();
    await expect(page.getByTestId('area-mismatch')).toBeVisible();
    await page.getByTestId('area-mismatch').scrollIntoViewIfNeeded();
    await shot(page, `p2-07-area-warning-${combo.name}`);
    const code = row(page, 'parcels[0].purposes[0].land_use_code');
    await code.getByTestId('field-edit').click();
    await code.getByTestId('purpose-code').fill('XYZ');
    await code.getByTestId('field-done').click();
    await expect(code.getByTestId('unknown-code')).toBeVisible();
    await code.scrollIntoViewIfNeeded();
    await shot(page, `p2-07-unknown-code-${combo.name}`);
    await acceptEvery(page);
    await page.getByTestId('review-change').scrollIntoViewIfNeeded();
    await shot(page, `p5-356-review-change-${combo.name}`);
    await page.getByTestId('review-submit').click();
    await expect(page.getByTestId('review-submit')).toHaveAttribute('data-state', 'confirm');
    await page.getByTestId('review-save').scrollIntoViewIfNeeded();
    await shot(page, `p5-356-review-mismatch-${combo.name}`);
    await page.route(`**/documents/${review}/review`, (route) => (route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue()));
    await page.getByTestId('review-submit').click();
    await expect(page.getByTestId('review-error')).toBeVisible();
    await shot(page, `p2-07-save-error-${combo.name}`);
    await page.unrouteAll();

    await page.goto(`/documents/${failed}/review`);
    await expect(page.getByTestId('review-intro')).toBeVisible();
    await shot(page, `p2-07-manual-${combo.name}`);

    expect((await role('viewer')).ok()).toBe(true);
    try {
      await page.goto(`/documents/${review}/review`);
      await expect(page.getByTestId('field-correct')).toHaveCount(0);
      await shot(page, `p2-07-viewer-${combo.name}`);
    } finally {
      expect((await role('admin')).ok()).toBe(true);
    }
  }

  await page.goto(`/documents/${review}/review`);
  await acceptEvery(page);
  await saveAnyway(page);
  await expect(page).toHaveURL(`/properties/${propertyId(8, 'long-an')}/legal`, { timeout: 15_000 });
  for (const combo of combos) {
    await page.setViewportSize(combo.viewport);
    await theme(combo.theme);
    await page.goto(`/properties/${propertyId(8, 'long-an')}/legal`);
    await expect(page.getByText('AA 01234567').first()).toBeVisible();
    await shot(page, `p2-07-legal-after-save-${combo.name}`);
  }
});
