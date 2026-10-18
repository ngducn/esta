import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { CRAFTED, extractionFixtures, type UploadFile } from '../fixtures/certificates/generator/uploads.tsx';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
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
const evidence = process.env.ESTA_EVIDENCE_DIR;

test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });

function fixture(id: string) {
  const found = extractionFixtures().find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);

let worker: AgentWorker | undefined;

test.beforeEach(async ({ request }) => {
  await setClock(request, '2026-10-07T09:00:00+07:00');
});

test.afterAll(async ({ request }) => {
  await worker?.stop();
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
  if (evidence !== undefined) await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
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

const pill = (page: Page, documentId: string) => page.locator(`[data-testid="document-tile"]:has(a[href="/api/documents/${documentId}/view"]) [data-testid="extraction-status"]`);

type Extraction = { id: string; status: string; result: Record<string, unknown> | null; job_id: string | null };
const extractions = (page: Page, documentId: string) =>
  serviceGet<Extraction[]>(page, `document_extractions?document_id=eq.${documentId}&select=id,status,result,job_id`);

test('rule 1: Mẹ uploads the Bảo Lộc scan, sees Đang đọc, then Chờ xem lại without a reload, and the Trợ lý page lists it', async ({ page }) => {
  await startWorker();
  await stopWorker();
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${propertyId(1, 'bao-loc')}/documents`);
  const scan = await fixture('gcn_2009_2024-scan').upload();
  const documentId = await upload(page, scan, { category: 'certificate', title: 'Sổ hồng Bảo Lộc' });
  await expect(pill(page, documentId)).toHaveText('Đang đọc', { timeout: 2_000 });
  await shot(page, 'p2-03-reading-390x844-light');

  await startWorker();
  await expect(pill(page, documentId)).toHaveText('Chờ xem lại', { timeout: 10_000 });
  await shot(page, 'p2-03-waiting-390x844-light');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const [extraction] = await extractions(page, documentId);
  expect(extraction?.status).toBe('needs_review');
  const items = await serviceGet<{ title: string }[]>(page, `agent_items?dedupe_key=eq.extract_review:${extraction?.id}&select=title`);
  expect(items).toEqual([{ title: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }]);

  await page.goto('/assistant');
  await expect(page.getByTestId('new-item').filter({ hasText: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }).first()).toBeVisible();
  await shot(page, 'p2-03-new-items-390x844-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: only the certificate queues a job keyed by its bytes; the photo and the lease contract queue nothing', async ({ page }) => {
  await stopWorker();
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/properties/${propertyId(2, 'bao-loc')}/documents`);
  const certificate = await upload(page, await fixture('so_do_pre2009-scan').upload(), { category: 'certificate', title: 'Sổ đỏ lane 2' });
  const photo = await upload(page, await fixture('paper_only-photo').upload(), { category: 'photo', title: 'Ảnh lane 2' });
  const lease = await upload(page, await fixture('paper_only-scan').upload(), { category: 'lease_contract', title: 'Hợp đồng lane 2' });

  const jobsOf = (id: string) => serviceGet<{ idempotency_key: string; status: string }[]>(page, `agent_jobs?payload->>document_id=eq.${id}&select=idempotency_key,status`);
  const [{ sha256 } = { sha256: '' }] = await serviceGet<{ sha256: string }[]>(page, `documents?id=eq.${certificate}&select=sha256`);
  expect(await jobsOf(certificate)).toEqual([{ idempotency_key: `extract_document:${certificate}:${sha256}`, status: 'queued' }]);
  expect((await extractions(page, certificate)).map((row) => row.status)).toEqual(['queued']);
  for (const other of [photo, lease]) {
    expect(await jobsOf(other)).toEqual([]);
    expect(await extractions(page, other)).toEqual([]);
  }
  await shot(page, 'p2-03-reading-1440x900-dark');
});

test('rule 4: the saved result of a photographed sổ hồng keeps only the last four digits of each ID (D11)', async ({ page }) => {
  await startWorker();
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  await page.goto(`/properties/${propertyId(4, 'bao-loc')}/documents`);
  const photo = fixture('so_hong_pre2009-photo');
  const documentId = await upload(page, await photo.upload(), { category: 'certificate', title: 'Sổ hồng lane 4' });
  await expect(pill(page, documentId)).toHaveText('Chờ xem lại', { timeout: 10_000 });
  await shot(page, 'p2-03-waiting-1440x900-light');
  const [extraction] = await extractions(page, documentId);
  const text = JSON.stringify(extraction?.result);
  expect(text).not.toMatch(/[0-9]{12}/);
  const holders = (extraction?.result as { holders: { id_last4: { value: string } }[] }).holders;
  expect(holders.map((holder) => holder.id_last4.value).toSorted()).toEqual(photo.printedIdNumbers.map((number) => number.slice(-4)).toSorted());
});

test('rule 7: a blank page fails after every attempt, the tile reads Không đọc được and admins get a retry item', async ({ page, request }) => {
  await startWorker();
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${propertyId(7, 'bao-loc')}/documents`);
  const documentId = await upload(page, await CRAFTED['blank-page'].upload(), { category: 'certificate', title: 'Trang trống lane 7' });
  const [extraction] = await extractions(page, documentId);
  const jobOf = async () => (await serviceGet<{ status: string; attempts: number }[]>(page, `agent_jobs?id=eq.${extraction?.job_id}&select=status,attempts`))[0];
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
  await expect(pill(page, documentId)).toHaveText('Không đọc được');
  await shot(page, 'p2-03-failed-390x844-light');
  expect((await extractions(page, documentId))[0]?.status).toBe('failed');
  const items = await serviceGet<{ severity: string; proposal: { type: string; min_role: string } }[]>(
    page,
    `agent_items?dedupe_key=eq.extract_failed:${extraction?.id}&select=severity,proposal`,
  );
  expect(items).toEqual([{ severity: 'info', proposal: expect.objectContaining({ type: 'retry_job', min_role: 'admin' }) }]);
});

test('rule 8: a utility bill for Nhà phố Q7 reaches Chờ xem lại with every required field equal to its truth', async ({ page }) => {
  await startWorker();
  await open(page, 'me.lane8@demo.esta.test', 'light', DESKTOP);
  await page.goto(`/properties/${propertyId(8, 'q7')}/documents`);
  const bill = fixture('electricity-q7-scan');
  const documentId = await upload(page, await bill.upload(), { category: 'utility_bill', title: 'Hóa đơn điện tháng 9' });
  await expect(pill(page, documentId)).toHaveText('Chờ xem lại', { timeout: 10_000 });
  const [extraction] = await extractions(page, documentId);
  const truth = bill.truth as Record<string, { value: unknown }>;
  for (const field of ['provider', 'customer_code', 'period', 'amount_vnd']) {
    expect((extraction?.result as Record<string, { value: unknown }>)[field]?.value, field).toEqual(truth[field]?.value);
  }
});

test('rule 9: in English at 130% and dark, the pill and the list read in English and nothing scrolls sideways', async ({ page }) => {
  await startWorker();
  const member = `household_members?invited_email=eq.${encodeURIComponent('me.lane10@demo.esta.test')}`;
  const patch = (data: unknown) => page.request.patch(`${rest}/${member}`, { headers: { ...service, 'content-type': 'application/json' }, data });
  expect((await patch({ locale: 'en', text_scale: 130 })).ok()).toBe(true);
  try {
    await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
    await page.goto(`/properties/${propertyId(10, 'bao-loc')}/documents`);
  const documentId = await upload(page, await fixture('gcn_2024-scan').upload(), { category: 'certificate', title: 'Sổ hồng Bảo Lộc' });
  await expect(pill(page, documentId)).toHaveText(/^(Reading|Ready for review)$/);
  await expect(pill(page, documentId)).toHaveText('Ready for review', { timeout: 10_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'New items' })).toBeVisible();
  await expect(page.getByTestId('new-item').filter({ hasText: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await patch({ locale: 'vi', text_scale: 100 });
  }
});
