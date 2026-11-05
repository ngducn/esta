import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { join } from 'node:path';
import { query } from '../scripts/db-checksum.ts';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { laneHousehold } from './helpers/seed';
import { accessToken } from './helpers/session';
import { DESKTOP, noSidewaysScroll, open, PHONE, rest, serviceUpsert, seriousAxeViolations, shot } from './helpers/wizard';

const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const service = e2eServiceHeaders();
const LANE = 7;
const HOUSEHOLD = laneHousehold(LANE);
const ME = `ryan.lane${LANE}@demo.esta.test`;

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop' && !test.info().title.includes('phone'), 'one viewport reads the same rows');
});

const partyNamed = (name: string) => {
  const [row] = query<{ id: string }>(workdir, `select id::text as id from public.parties where household_id = '${HOUSEHOLD}' and full_name = '${name}'`);
  if (row === undefined) throw new Error(`no party ${name}`);
  return row.id;
};
const nameOf = (id: string) => query<{ full_name: string }>(workdir, `select full_name from public.parties where id = '${id}'`)[0]?.full_name;
const downloads = () => query<{ n: number }>(workdir, `select count(*)::int as n from public.document_access_log where household_id = '${HOUSEHOLD}' and action = 'download'`)[0]?.n ?? 0;

test('Ryan exports one tenant: their rows and files, no other tenant, and one access-log row per document (DOMAIN-VN §8)', async ({ page }) => {
  await open(page, ME, 'light', DESKTOP);
  const tenant = partyNamed('Lê Văn Cường Demo');
  const documentId = randomUUID();
  const path = `${HOUSEHOLD}/${documentId}/hop-dong.pdf`;
  const upload = await page.request.post(`${rest.replace('/rest/v1', '/storage/v1')}/object/documents/${path}`, { headers: { ...service, 'content-type': 'application/pdf' }, data: Buffer.from('%PDF-1.4 demo') });
  expect(upload.ok(), await upload.text()).toBe(true);
  const lease = query<{ id: string }>(workdir, `select id::text as id from public.leases where household_id = '${HOUSEHOLD}' and tenant_party_id = '${tenant}'`)[0]?.id;
  await serviceUpsert(page, 'documents', { id: documentId, household_id: HOUSEHOLD, party_id: tenant, lease_id: lease, category: 'lease_contract', title: 'Hợp đồng Demo', storage_path: path, mime: 'application/pdf', size_bytes: 13, sha256: 'a'.repeat(64), sensitivity: 'normal' });

  const before = downloads();
  const response = await page.request.post(`/api/export/party/${tenant}`);
  expect(response.status(), await response.text()).toBe(200);
  const { parts } = (await response.json()) as { parts: { url: string }[] };
  expect(parts).toHaveLength(1);
  const entries = unzipSync(new Uint8Array(await (await page.request.get(parts[0]?.url ?? '')).body()));
  const rows = (table: string) => JSON.parse(strFromU8(entries[`tables/${table}.json`] ?? new Uint8Array())) as Record<string, unknown>[];

  expect(rows('parties').map((row) => row.full_name)).toEqual(['Lê Văn Cường Demo']);
  expect(rows('leases').map((row) => row.tenant_party_id)).toEqual([tenant]);
  expect(rows('invoices').length).toBeGreaterThan(0);
  expect(rows('payments').length).toBeGreaterThan(0);
  expect(rows('deposit_entries').length).toBeGreaterThan(0);
  expect(rows('documents').map((row) => row.id)).toContain(documentId);
  expect(Object.keys(entries)).toContain(`files/documents/${path}`);
  expect(JSON.parse(strFromU8(entries['manifest.json'] ?? new Uint8Array()))).toMatchObject({ kind: 'party', partyId: tenant, householdId: HOUSEHOLD });

  const others = query<{ full_name: string }>(workdir, `select full_name from public.parties where household_id = '${HOUSEHOLD}' and id <> '${tenant}'`).map((row) => row.full_name);
  expect(others.length).toBeGreaterThan(5);
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.startsWith('files/')) continue;
    const content = strFromU8(bytes);
    for (const other of others) expect(content.includes(other), `${name} names ${other}`).toBe(false);
  }
  const documents = rows('documents').length;
  expect(downloads() - before, 'one download row per document in the ZIP').toBe(documents);
});

test('the tenant page offers the export and answers 404 to a viewer and to a person of another household', async ({ page, browser }) => {
  await open(page, ME, 'light', DESKTOP);
  const tenant = partyNamed('Lê Văn Cường Demo');
  await page.goto(`/tenants/${tenant}`);
  await expect(page.getByTestId('tenant-name')).toHaveText('Lê Văn Cường Demo');
  await expect(page.getByTestId('tenant-lease')).toHaveCount(1);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('export-start').click();
  await expect(page.getByTestId('export-link')).toHaveText('Tải tệp ZIP (hết hạn sau 5 phút)');
  await shot(page, 'p6-02c-party-export-1440-light');

  const stranger = query<{ id: string }>(workdir, `select id::text as id from public.parties where household_id <> '${HOUSEHOLD}' limit 1`)[0]?.id;
  expect((await page.goto(`/tenants/${stranger}`))?.status()).toBe(404);
  expect((await page.request.post(`/api/export/party/${stranger}`)).status()).toBe(404);

  const invited = `viewer.party.lane${LANE}@demo.esta.test`;
  await serviceUpsert(page, 'household_members', { household_id: HOUSEHOLD, invited_email: invited, role: 'viewer' }).catch(() => undefined);
  const viewer = await browser.newPage();
  try {
    await open(viewer, invited, 'light', DESKTOP);
    expect((await viewer.goto(`/tenants/${tenant}`))?.status()).toBe(404);
    expect((await viewer.request.post(`/api/export/party/${tenant}`)).status()).toBe(403);
  } finally {
    await viewer.close();
  }
});

test('erasing is refused with a way forward while a lease runs or a deposit is held, and nothing changes', async ({ page }) => {
  await open(page, ME, 'light', DESKTOP);
  const cases = [
    ['Lê Văn Cường Demo', 'active_lease', 'đang có hợp đồng còn hiệu lực. Kết thúc hợp đồng rồi xóa thông tin.'],
    ['Bùi Văn Hùng Demo', 'deposit_held', 'Hoàn cọc hoặc trừ hết cọc rồi xóa thông tin.'],
  ] as const;
  for (const [name, reason, advice] of cases) {
    const id = partyNamed(name);
    await page.goto(`/tenants/${id}`);
    await page.getByTestId('erase-start').click();
    await expect(page.getByTestId('erase-question')).toHaveText(`Xóa thông tin cá nhân của ${name}?`);
    await page.getByTestId('erase-confirm').click();
    const refusal = page.getByTestId('erase-refusal');
    await expect(refusal).toHaveAttribute('data-reason', reason);
    await expect(refusal).toContainText(advice);
    expect(nameOf(id)).toBe(name);
  }
});

test('Ryan erases a former tenant: the name reads Đã xóa, the ID card he filed on their lease and its files go, and the money stays (phone)', async ({ page }) => {
  await open(page, ME, 'light', PHONE);
  const id = randomUUID();
  const leaseId = randomUUID();
  await serviceUpsert(page, 'parties', { id, household_id: HOUSEHOLD, kind: 'individual', full_name: 'Demo Người Đi Rồi', phone: '+84903999888', email: 'di.roi@demo.test', id_last4: '4321', tags: ['tenant'] });
  const [room] = query<{ property_id: string; id: string }>(workdir, `select property_id::text as property_id, id::text as id from public.units where household_id = '${HOUSEHOLD}' and kind = 'room' order by id limit 1`);
  await serviceUpsert(page, 'leases', { id: leaseId, household_id: HOUSEHOLD, property_id: room?.property_id, unit_id: room?.id, tenant_party_id: id, start_date: '2019-01-01', end_date: '2019-12-31', rent_vnd: 2_000_000, deposit_vnd: 0, status: 'ended' });

  await page.goto(`/properties/${room?.property_id}/rental/leases/${leaseId}`);
  await expect(page.getByTestId('lease-upload')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('lease-upload').click();
  const card = await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 120, g: 90, b: 60 }, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).jpeg().toBuffer();
  await page.getByTestId('camera-input').setInputFiles({ name: 'cccd.jpg', mimeType: 'image/jpeg', buffer: card });
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('document-category').selectOption('id_card');
  await page.getByTestId('document-title').fill('CCCD Demo Người Đi Rồi');
  await page.getByTestId('save-document').click();
  await expect(page.getByTestId('lease-document')).toHaveCount(1, { timeout: 30_000 });
  const [filed] = query<{ id: string; party_id: string | null }>(workdir, `select id::text as id, party_id::text as party_id from public.documents where lease_id = '${leaseId}' and category = 'id_card'`);
  const cardId = filed?.id ?? '';
  expect(filed?.party_id, 'the upload sheet files the card on the lease, not on the person').toBeNull();
  const filesOf = () => query<{ n: number }>(workdir, `select count(*)::int as n from storage.objects where bucket_id = 'documents' and name like '${HOUSEHOLD}/${cardId}/%'`)[0]?.n;
  expect(filesOf(), 'the upload put the file and its previews in Storage').toBeGreaterThan(0);
  const totals = () => query<{ leases: number; invoices: number; payments: number }>(workdir, `select (select count(*) from public.leases where household_id = '${HOUSEHOLD}')::int as leases, (select count(*) from public.invoices where household_id = '${HOUSEHOLD}')::int as invoices, (select count(*) from public.payments where household_id = '${HOUSEHOLD}')::int as payments`)[0];
  const before = totals();

  await page.goto(`/tenants/${id}`);
  await expect(page.getByTestId('tenant-name')).toHaveText('Demo Người Đi Rồi');
  await page.getByTestId('erase-start').click();
  await expect(page.getByTestId('erase-question')).toHaveText('Xóa thông tin cá nhân của Demo Người Đi Rồi?');
  await shot(page, 'p6-02c-erase-confirm-390-light');
  await page.getByTestId('erase-confirm').click();
  await expect(page.getByTestId('tenant-erased')).toBeVisible();
  await expect(page.getByTestId('tenant-name')).toHaveText('Đã xóa');
  await expect(page.getByTestId('erase-start')).toHaveCount(0);
  await expect(page.getByTestId('export-start'), 'nothing is left to export once the details are erased').toHaveCount(0);
  await expect(page.getByTestId('finish-start')).toHaveCount(0);
  await shot(page, 'p6-02c-erased-390-light');
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);

  expect(query(workdir, `select full_name, phone, email, id_last4 from public.parties where id = '${id}'`)).toEqual([{ full_name: 'Đã xóa', phone: null, email: null, id_last4: null }]);
  expect(query<{ n: number }>(workdir, `select count(*)::int as n from public.documents where id = '${cardId}'`)[0]?.n, 'the ID card document is gone').toBe(0);
  expect(filesOf(), 'the files are gone from Storage').toBe(0);
  expect(totals()).toEqual(before);
  expect(query<{ n: number }>(workdir, `select count(*)::int as n from public.audit_log where row_id = '${id}' and diff::text ~ 'Người Đi Rồi|di.roi|4321|903999888'`)[0]?.n, 'the audit trail keeps no erased value').toBe(0);
});

test('an erase that stopped before the files went hides them from a viewer, and the person\'s page finishes the job (phone)', async ({ page, browser }) => {
  await open(page, ME, 'light', PHONE);
  const id = randomUUID();
  const cardId = randomUUID();
  const name = `${HOUSEHOLD}/${cardId}/front.jpg`;
  await serviceUpsert(page, 'parties', { id, household_id: HOUSEHOLD, kind: 'individual', full_name: 'Đã xóa', tags: ['tenant'] });
  const upload = await page.request.post(`${rest.replace('/rest/v1', '/storage/v1')}/object/documents/${name}`, { headers: { ...service, 'content-type': 'image/jpeg' }, data: Buffer.from('jpeg') });
  expect(upload.ok(), await upload.text()).toBe(true);
  query(workdir, `insert into private.file_removals (name, household_id, party_id) values ('${name}', '${HOUSEHOLD}', '${id}')`);
  const stored = () => query<{ n: number }>(workdir, `select count(*)::int as n from storage.objects where bucket_id = 'documents' and name = '${name}'`)[0]?.n;
  expect(stored()).toBe(1);

  const invited = `viewer.party.lane${LANE}@demo.esta.test`;
  await serviceUpsert(page, 'household_members', { household_id: HOUSEHOLD, invited_email: invited, role: 'viewer' }).catch(() => undefined);
  const viewer = await browser.newPage();
  try {
    await open(viewer, invited, 'light', PHONE);
    const read = await viewer.request.get(`${rest.replace('/rest/v1', '/storage/v1')}/object/authenticated/documents/${name}`, { headers: { authorization: `Bearer ${await accessToken(viewer)}`, apikey: service.apikey ?? '' } });
    expect(read.status(), 'a viewer gets no file').toBeGreaterThanOrEqual(400);
  } finally {
    await viewer.close();
  }

  await page.goto(`/tenants/${id}`);
  await expect(page.getByTestId('tenant-erased')).toBeVisible();
  await page.getByTestId('finish-start').click();
  await page.getByTestId('erase-confirm').click();
  await expect(page.getByTestId('finish-start')).toHaveCount(0, { timeout: 15_000 });
  expect(stored(), 'the retry removed the file').toBe(0);
});
