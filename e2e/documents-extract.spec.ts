import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const pill = (page: Page, documentId: string) => page.locator(`[data-testid="document-tile"][data-document-id="${documentId}"] [data-testid="extraction-status"]`);

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
  const asked: string[] = [];
  page.on('request', (sent) => {
    if (sent.method() === 'POST' && sent.headers()['next-action'] !== undefined) asked.push(sent.url());
  });
  await page.waitForTimeout(6_000);
  expect(asked, 'no status request once nothing on screen is being read').toEqual([]);

  const [extraction] = await extractions(page, documentId);
  expect(extraction?.status).toBe('needs_review');
  const items = await serviceGet<{ title: string }[]>(page, `agent_items?dedupe_key=eq.extract_review:${extraction?.id}&select=title`);
  expect(items).toEqual([{ title: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }]);

  await page.goto('/assistant');
  const item = page.getByTestId('inbox-item').filter({ hasText: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }).first();
  await expect(item).toBeVisible();
  await expect(item.locator('time'), 'timed by the frozen test clock').toHaveText('09:00');
  await shot(page, 'p2-03-new-items-390x844-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: the certificate and the lease contract queue a job keyed by their bytes; the photo queues nothing', async ({ page }) => {
  await stopWorker();
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/properties/${propertyId(2, 'bao-loc')}/documents`);
  const certificate = await upload(page, await fixture('so_do_pre2009-scan').upload(), { category: 'certificate', title: 'Sổ đỏ lane 2' });
  const photo = await upload(page, await fixture('paper_only-photo').upload(), { category: 'photo', title: 'Ảnh lane 2' });
  const lease = await upload(page, await fixture('paper_only-scan').upload(), { category: 'lease_contract', title: 'Hợp đồng lane 2' });

  const jobsOf = (id: string) => serviceGet<{ idempotency_key: string; status: string }[]>(page, `agent_jobs?payload->>document_id=eq.${id}&select=idempotency_key,status`);
  for (const read of [certificate, lease]) {
    const [{ sha256 } = { sha256: '' }] = await serviceGet<{ sha256: string }[]>(page, `documents?id=eq.${read}&select=sha256`);
    expect(await jobsOf(read)).toEqual([{ idempotency_key: `extract_document:${read}:${sha256}`, status: 'queued' }]);
    expect((await extractions(page, read)).map((row) => row.status)).toEqual(['queued']);
  }
  expect(await jobsOf(photo)).toEqual([]);
  expect(await extractions(page, photo)).toEqual([]);
  await shot(page, 'p2-03-reading-1440x900-dark');
});

test('rule 3: a worker killed right after save_extraction re-runs the job and leaves one extraction and one item (AGT-1)', async ({ page, request }) => {
  await stopWorker();
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await page.goto(`/properties/${propertyId(3, 'bao-loc')}/documents`);
  const documentId = await upload(page, await fixture('gcn_2024-low-light').upload(), { category: 'certificate', title: 'Sổ hồng lane 3' });
  const [queued] = await extractions(page, documentId);
  const jobOf = async () => (await serviceGet<{ status: string; attempts: number }[]>(page, `agent_jobs?id=eq.${queued?.job_id}&select=status,attempts`))[0];

  // Earlier rules may leave other households' jobs queued, so the crash waits for this extraction's save.
  const crashed = await startAgentWorker({ crashOn: new RegExp(`save_extraction ok ${queued?.id}`) });
  await expect.poll(() => crashed.running(), { timeout: 15_000 }).toBe(false);
  await crashed.exited();
  expect(await jobOf(), 'the worker died after save_extraction and before it finished the job').toEqual({ status: 'running', attempts: 1 });

  // The claim takes back a running job only after its 5 minute timeout and 2 minutes of grace.
  await setClock(request, '2026-10-07T09:08:00+07:00');
  await startWorker();
  await expect.poll(jobOf, { timeout: 10_000 }).toEqual({ status: 'done', attempts: 2 });
  expect((await extractions(page, documentId)).map((row) => row.status)).toEqual(['needs_review']);
  expect(await serviceGet<unknown[]>(page, `agent_items?dedupe_key=eq.extract_review:${queued?.id}&select=id`)).toHaveLength(1);
  await page.reload();
  await expect(pill(page, documentId)).toHaveText('Chờ xem lại');
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

type Run = { num_turns: number; tool_calls: Record<string, number>; usage: { permission_denials?: { tool_name: string; tool_input: { file_path?: string } }[] } };

test('rule 5: a repair turn saves area_m2 as a number, a read outside the job directory is denied, and no job directory is left (DOC-5)', async ({ page }) => {
  const home = mkdtempSync(join(tmpdir(), 'esta-e2e-agent-'));
  await stopWorker();
  worker = await startAgentWorker({ home });
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${propertyId(5, 'bao-loc')}/documents`);
  const repaired = await upload(page, await CRAFTED['repair-invalid-area'].upload(), { category: 'certificate', title: 'Sổ hồng lane 5' });
  const denied = await upload(page, await CRAFTED['deny-outside-read'].upload(), { category: 'certificate', title: 'Sổ đỏ lane 5' });
  for (const id of [repaired, denied]) await expect(pill(page, id)).toHaveText('Chờ xem lại', { timeout: 10_000 });

  const runOf = async (documentId: string) => {
    const [extraction] = await extractions(page, documentId);
    const runs = await serviceGet<Run[]>(page, `agent_runs?job_id=eq.${extraction?.job_id}&select=num_turns,tool_calls,usage`);
    return { extraction, runs, jobId: extraction?.job_id ?? '' };
  };
  const repair = await runOf(repaired);
  expect(repair.extraction?.status).toBe('needs_review');
  expect(repair.runs).toEqual([expect.objectContaining({ num_turns: 4, tool_calls: expect.objectContaining({ mcp__esta__save_extraction: 2 }) })]);
  const parcels = (repair.extraction?.result as { parcels: { area_m2: { value: unknown } }[] }).parcels;
  expect(parcels[0]?.area_m2.value).toBe(68.4);

  const deny = await runOf(denied);
  expect(deny.extraction?.status).toBe('needs_review');
  expect(deny.runs[0]?.usage.permission_denials).toEqual([expect.objectContaining({ tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } })]);

  for (const jobId of [repair.jobId, deny.jobId]) expect(existsSync(join(home, 'jobs', jobId)), `jobs/${jobId}`).toBe(false);
  expect(readdirSync(join(home, 'jobs'))).toEqual([]);
});

test('rule 6: with the worker stopped the tile says the assistant is offline, the job waits, and the document is read once it starts', async ({ page, request }) => {
  await stopWorker();
  await open(page, 'ryan.lane6@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/properties/${propertyId(6, 'bao-loc')}/documents`);
  const documentId = await upload(page, await fixture('gcn_2024-photo').upload(), { category: 'certificate', title: 'Sổ hồng lane 6' });

  // Six minutes past the last beat of any worker, earlier rules' included, so no heartbeat is fresh.
  const [beat] = await serviceGet<{ last_seen_at: string }[]>(page, 'worker_heartbeats?select=last_seen_at&order=last_seen_at.desc&limit=1');
  const lastBeat = Math.max(Date.parse(beat?.last_seen_at ?? ''), Date.parse('2026-10-07T09:00:00+07:00'));
  await setClock(request, new Date(lastBeat + 6 * 60_000).toISOString());
  await expect(pill(page, documentId)).toHaveText('Trợ lý ngoại tuyến', { timeout: 10_000 });
  await shot(page, 'p2-03-offline-1440x900-dark');
  const [queued] = await extractions(page, documentId);
  expect(queued?.status).toBe('queued');
  expect(await serviceGet(page, `agent_jobs?id=eq.${queued?.job_id}&select=status`)).toEqual([{ status: 'queued' }]);

  await startWorker();
  await expect(pill(page, documentId)).toHaveText('Chờ xem lại', { timeout: 20_000 });
  expect((await extractions(page, documentId)).map((row) => row.status)).toEqual(['needs_review']);
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
  await page.goto('/assistant');
  const item = page.getByTestId('inbox-item').filter({ hasText: 'Trợ lý không đọc được Trang trống lane 7.' });
  await expect(item.getByText('Bạn có thể nhập tay.', { exact: true })).toBeVisible();
  await expect(item).not.toContainText('thử lại');
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
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByTestId('inbox-item').filter({ hasText: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await patch({ locale: 'vi', text_scale: 100 });
  }
});
