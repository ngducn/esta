import { NATIONAL_ID_VECTORS } from '../../../../../packages/core/src/agent-schemas/national-id-vectors';
import { reduceNationalIds } from '@esta/core/agent-schemas';
import { manualEntryId, rowId } from '@esta/core/extraction/acceptance';
import { reviewFields } from '@esta/core/extraction/fields';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import truthFile from '../../../../../fixtures/certificates/gcn_2024-photo/truth.json';
import billTruth from '../../../../../fixtures/utility-bills/electricity-q7-scan/truth.json';
import { e2eServiceHeaders } from '../../../../../scripts/e2e-service';
import { parseSlot } from '../../../../../scripts/slot';
import { slotEnv } from '../../../../../scripts/slot-env';
import { seedId } from '../../../../../supabase/seed/generator/ids';

const session = vi.hoisted(() => ({
  client: null as unknown,
  member: { role: 'member', household: { id: '' } },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/member', () => ({ requireMember: async () => session.member }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => session.client }));

const { saveExtractionReview } = await import('./actions');

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
const env = slotEnv(join(import.meta.dirname, '../../../../..'), parseSlot(process.env.ESTA_SLOT));
vi.unstubAllEnvs();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const stackUp = anonKey !== '' && (await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }).then((r) => r.ok, () => false));

const LANE = 9;
const household = seedId(`seed:household:lane-${LANE}`);
const propertyId = seedId(`seed:property:lane-${LANE}:bao-loc`);
// Ryan's emails, so a sign-in code never races the documents test, which signs in Mẹ of lanes 8 and 9.
const memberUser = seedId(`seed:user:ryan-lane-${LANE}`);
const documents: string[] = [];
const acceptAllOf = (result: unknown) => Object.fromEntries(reviewFields('certificate_v1', result).map((field) => [field.path, { kind: 'accepted' }]));
const acceptAll = acceptAllOf(truthFile.certificate);

const FIXTURES = join(import.meta.dirname, '../../../../../fixtures/certificates');
const truths = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'generator')
  .map((entry) => ({ id: entry.name, certificate: (JSON.parse(readFileSync(join(FIXTURES, entry.name, 'truth.json'), 'utf8')) as { certificate: unknown }).certificate }));

// Each call of e2eServiceHeaders runs `supabase status`; one key per run keeps a hundred saves from racing it.
let headers: Record<string, string> | undefined;
const serviceHeaders = () => (headers ??= e2eServiceHeaders());

async function signedInAs(email: string): Promise<SupabaseClient> {
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const { email_otp: token } = (await link.json()) as { email_otp: string };
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return client;
}

async function service<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), 'content-type': 'application/json', prefer: 'return=representation', ...init.headers },
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  return (await response.json().catch(() => null)) as T;
}

const patch = (path: string, body: unknown) => service(path, { method: 'PATCH', body: JSON.stringify(body) });

/** A certificate document whose extraction the worker has read and left waiting, written as the worker writes it. */
async function waitingExtraction(status: 'needs_review' | 'failed' = 'needs_review', result: unknown = truthFile.certificate): Promise<{ documentId: string; extractionId: string }> {
  const documentId = randomUUID();
  const extractionId = randomUUID();
  documents.push(documentId);
  await service('documents', {
    method: 'POST',
    body: JSON.stringify({
      id: documentId,
      household_id: household,
      property_id: propertyId,
      category: 'certificate',
      title: 'Sổ hồng Demo',
      storage_path: `${household}/${documentId}/so-hong.jpg`,
      mime: 'image/jpeg',
      size_bytes: 1000,
      sha256: randomBytes(32).toString('hex'),
      sensitivity: 'sensitive',
    }),
  });
  await service('document_extractions', {
    method: 'POST',
    body: JSON.stringify({ id: extractionId, household_id: household, document_id: documentId, schema_name: 'certificate_v1', schema_version: 1 }),
  });
  if (status === 'failed') {
    await patch(`document_extractions?id=eq.${extractionId}`, { status: 'failed' });
    return { documentId, extractionId };
  }
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'running' });
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'needs_review', result, model: 'replay' });
  return { documentId, extractionId };
}

const count = async (path: string) => (await service<unknown[]>(path)).length;

const BILL_TEXT = 'ĐIỆN LỰC DEMO TÂN THUẬN. HÓA ĐƠN TIỀN ĐIỆN tháng 9/2026. Tổng cộng 1.234.764 đ';
const billResult = (fullText: string) => ({ ...billTruth.bill, full_text: fullText });
const acceptBill = Object.fromEntries(reviewFields('utility_bill_v1', billTruth.bill).map((field) => [field.path, { kind: 'accepted' }]));

/** A utility bill whose read waits for review, with the printed text the worker keeps beside the fields. */
async function waitingBill(sensitivity: 'normal' | 'sensitive', fullText = BILL_TEXT): Promise<{ documentId: string; extractionId: string }> {
  const documentId = randomUUID();
  const extractionId = randomUUID();
  documents.push(documentId);
  await service('documents', {
    method: 'POST',
    body: JSON.stringify({
      id: documentId,
      household_id: household,
      property_id: propertyId,
      category: 'utility_bill',
      title: 'Hóa đơn điện Demo',
      storage_path: `${household}/${documentId}/hoa-don.pdf`,
      mime: 'application/pdf',
      size_bytes: 1000,
      sha256: randomBytes(32).toString('hex'),
      sensitivity,
    }),
  });
  await service('document_extractions', {
    method: 'POST',
    body: JSON.stringify({ id: extractionId, household_id: household, document_id: documentId, schema_name: 'utility_bill_v1', schema_version: 1 }),
  });
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'running' });
  await patch(`document_extractions?id=eq.${extractionId}`, { status: 'needs_review', result: billResult(fullText), model: 'replay' });
  return { documentId, extractionId };
}

const ocrText = async (documentId: string) => (await service<{ ocr_text: string | null }[]>(`documents?id=eq.${documentId}&select=ocr_text`))[0]?.ocr_text;

/** Counts what one extraction wrote: its certificate, the parcels and structures under it, and the household's parties. */
async function written(extractionId: string) {
  const certificate = rowId(extractionId, 'certificate');
  return {
    certificates: await count(`certificates?extraction_id=eq.${extractionId}&select=id`),
    parcels: await count(`parcels?certificate_id=eq.${certificate}&select=id`),
    structures: await count(`structures?certificate_id=eq.${certificate}&select=id`),
    parties: await count(`parties?household_id=eq.${household}&select=id`),
  };
}

/** The member's session, except the first upsert into `table` comes back failed, as a cut connection would leave it. */
function cutOnce(client: SupabaseClient, table: string): SupabaseClient {
  let cut = false;
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'from') return Reflect.get(target, property, receiver);
      return (name: string) => {
        if (name !== table || cut) return target.from(name);
        cut = true;
        return { upsert: async () => ({ data: null, error: { message: 'connection cut' } }) };
      };
    },
  });
}

describe.skipIf(!stackUp)(`saveExtractionReview against the ESTA_SLOT=${process.env.ESTA_SLOT ?? 0} stack`, () => {
  let member: SupabaseClient;
  let outsider: SupabaseClient;

  beforeAll(async () => {
    member = await signedInAs(`ryan.lane${LANE}@demo.esta.test`);
    outsider = await signedInAs('ryan.lane8@demo.esta.test');
  });

  afterAll(async () => {
    if (documents.length === 0) return;
    const ids = documents.join(',');
    const certificates = await service<{ id: string; holder_party_ids: string[] }[]>(`certificates?document_id=in.(${ids})&select=id,holder_party_ids`);
    const certificateIds = certificates.map((row) => row.id).join(',');
    if (certificateIds !== '') {
      await service(`parcels?certificate_id=in.(${certificateIds})`, { method: 'DELETE' });
      await service(`structures?certificate_id=in.(${certificateIds})`, { method: 'DELETE' });
      await service(`certificates?id=in.(${certificateIds})`, { method: 'DELETE' });
    }
    const created = certificates.flatMap((row) => row.holder_party_ids).filter((id) => id !== seedId(`seed:party:me-lane-${LANE}`));
    if (created.length > 0) await service(`parties?id=in.(${[...new Set(created)].join(',')})`, { method: 'DELETE' });
    const extractions = await service<{ id: string }[]>(`document_extractions?document_id=in.(${ids})&select=id`);
    const accounts = extractions.map((row) => rowId(row.id, 'utility_account')).join(',');
    if (accounts !== '') await service(`utility_accounts?id=in.(${accounts})`, { method: 'DELETE' });
    await service(`documents?id=in.(${ids})`, { method: 'DELETE' });
  });

  const asMember = () => {
    session.client = member;
    session.member = { role: 'member', household: { id: household } };
  };

  test('saving twice leaves one certificate, the parcels and structures of the truth, and no extra party', async () => {
    asMember();
    const { extractionId } = await waitingExtraction();
    const parties = await count(`parties?household_id=eq.${household}&select=id`);
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: true, propertyId });
    const once = await written(extractionId);
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: true, propertyId });
    expect(await written(extractionId)).toEqual(once);
    expect(once).toEqual({ certificates: 1, parcels: truthFile.certificate.parcels.length, structures: truthFile.certificate.structures.length, parties: parties + 2 });
    const [extraction] = await service<{ status: string; reviewed_by: string; accepted_fields: Record<string, unknown> }[]>(
      `document_extractions?id=eq.${extractionId}&select=status,reviewed_by,accepted_fields`,
    );
    expect(extraction).toMatchObject({ status: 'accepted', reviewed_by: memberUser });
    expect(Object.keys(extraction?.accepted_fields ?? {}).toSorted()).toEqual(Object.keys(acceptAll).toSorted());
  });

  test('a save cut after the certificate step and saved again converges on the same rows', async () => {
    asMember();
    const { extractionId } = await waitingExtraction();
    session.client = cutOnce(member, 'parcels');
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: false, reason: 'failed' });
    expect(await written(extractionId)).toMatchObject({ certificates: 1, parcels: 0 });
    expect(await service(`document_extractions?id=eq.${extractionId}&select=status`)).toEqual([{ status: 'needs_review' }]);

    session.client = member;
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: true, propertyId });
    expect(await written(extractionId)).toMatchObject({ certificates: 1, parcels: 1, structures: 1 });
    expect(await service(`parcels?id=eq.${rowId(extractionId, 'parcels[0]')}&select=area_m2,parcel_no`)).toEqual([{ area_m2: 82.7, parcel_no: '56' }]);
    expect(await service(`document_extractions?id=eq.${extractionId}&select=status`)).toEqual([{ status: 'accepted' }]);
  });

  test('the history names the member as the actor of every row the save wrote, never the assistant', async () => {
    asMember();
    const { extractionId } = await waitingExtraction();
    expect(await saveExtractionReview(extractionId, acceptAll)).toMatchObject({ ok: true });
    // The holders already exist from the first test, so this save reuses their parties and writes none.
    const rows = [rowId(extractionId, 'certificate'), rowId(extractionId, 'parcels[0]'), rowId(extractionId, 'structures[0]')];
    const audit = await service<{ actor_kind: string; actor_id: string }[]>(`audit_log?row_id=in.(${rows.join(',')})&select=actor_kind,actor_id`);
    expect(audit.length).toBeGreaterThanOrEqual(rows.length);
    expect(new Set(audit.map((row) => `${row.actor_kind}:${row.actor_id}`))).toEqual(new Set([`user:${memberUser}`]));
  });

  test('a failed read saved by hand inserts one accepted extraction with no model, and its parcel', async () => {
    asMember();
    const { documentId, extractionId } = await waitingExtraction('failed');
    const decisions = { form: { kind: 'edited', value: 'paper_only' }, 'parcels[0].parcel_no': { kind: 'edited', value: '12' }, 'parcels[0].area_m2': { kind: 'edited', value: '300,5' } };
    expect(await saveExtractionReview(extractionId, decisions)).toEqual({ ok: true, propertyId });
    expect(await saveExtractionReview(extractionId, decisions)).toEqual({ ok: true, propertyId });
    const manual = manualEntryId(extractionId);
    expect(await service(`document_extractions?document_id=eq.${documentId}&select=id,status,model&order=status`)).toEqual([
      { id: manual, status: 'accepted', model: null },
      { id: extractionId, status: 'failed', model: null },
    ]);
    expect(await service(`parcels?id=eq.${rowId(manual, 'parcels[0]')}&select=parcel_no,area_m2`)).toEqual([{ parcel_no: '12', area_m2: 300.5 }]);
  });

  test('each of the 16 certificate truths saves with every field accepted as read', async () => {
    asMember();
    expect(truths).toHaveLength(16);
    for (const { id, certificate } of truths) {
      const { extractionId } = await waitingExtraction('needs_review', certificate);
      expect(await saveExtractionReview(extractionId, acceptAllOf(certificate)), id).toEqual({ ok: true, propertyId });
    }
  }, 60_000);

  test('an ID that reads as one only once its spaces are squeezed is stored by its last four digits, typed or read (D11)', async () => {
    asMember();
    const [origin, label] = NATIONAL_ID_VECTORS.squeezed;
    if (origin === undefined || label === undefined) throw new Error('squeezed vectors');
    const typed = await waitingExtraction();
    const decisions = { ...acceptAll, 'parcels[0].origin_text': { kind: 'edited', value: origin[1] }, issued_by: { kind: 'edited', value: label[1] } };
    const certificate = truthFile.certificate;
    const read = await waitingExtraction(
      'needs_review',
      reduceNationalIds({ ...certificate, parcels: [{ ...certificate.parcels[0], origin_text: { ...certificate.parcels[0]?.origin_text, value: origin[1] } }] }),
    );
    const saves = [
      { extractionId: typed.extractionId, decisions, issuedBy: label[2] },
      { extractionId: read.extractionId, decisions: acceptAll, issuedBy: certificate.issued_by.value },
    ];
    for (const { extractionId, decisions: decided, issuedBy } of saves) {
      expect(await saveExtractionReview(extractionId, decided)).toEqual({ ok: true, propertyId });
      const rows = [rowId(extractionId, 'certificate'), rowId(extractionId, 'parcels[0]')];
      expect(await service(`certificates?id=eq.${rows[0]}&select=issued_by`)).toEqual([{ issued_by: issuedBy }]);
      expect(await service(`parcels?id=eq.${rows[1]}&select=origin_text`)).toEqual([{ origin_text: origin[2] }]);
      const audit = await service<unknown[]>(`audit_log?row_id=in.(${rows.join(',')})&select=diff`);
      expect(audit.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(audit)).not.toMatch(/\d{6} \d{6}|CCCD \d{9}/u);
    }
  });

  test('a number typed with an ID in it, or past its bounds, is refused before anything is written (D11)', async () => {
    asMember();
    const parties = await count(`parties?household_id=eq.${household}&select=id`);
    const cases = [
      { path: 'parcels[0].area_m2', value: '9999999999,99', reason: 'invalid' },
      { path: 'parcels[0].area_m2', value: '001123456789', reason: 'invalid' },
      { path: 'structures[0].floor_area_m2', value: '0791234567,89', reason: 'invalid' },
      { path: 'parcels[0].area_m2', value: '123456789', reason: 'out_of_range' },
    ];
    for (const { path, value, reason } of cases) {
      const { extractionId } = await waitingExtraction();
      expect(await saveExtractionReview(extractionId, { ...acceptAll, [path]: { kind: 'edited', value } }), value).toEqual({ ok: false, reason, paths: [path] });
      expect(await written(extractionId), value).toEqual({ certificates: 0, parcels: 0, structures: 0, parties });
      expect(await service(`document_extractions?id=eq.${extractionId}&select=status`), value).toEqual([{ status: 'needs_review' }]);
    }
  }, 30_000);

  test('a term typed as a range saves its end, month or full date', async () => {
    asMember();
    for (const [typed, term] of [['Từ tháng 10/1993 đến tháng 10/2043', '2043-10-31'], ['Từ 15/10/1993 đến 15/10/2043', '2043-10-15']] as const) {
      const { extractionId } = await waitingExtraction();
      expect(await saveExtractionReview(extractionId, { ...acceptAll, 'parcels[0].purposes[0].term': { kind: 'edited', value: typed } }), typed).toEqual({ ok: true, propertyId });
      const [parcel] = await service<{ purposes: { term: string }[] }[]>(`parcels?id=eq.${rowId(extractionId, 'parcels[0]')}&select=purposes`);
      expect(parcel?.purposes.map((purpose) => purpose.term), typed).toEqual([term]);
    }
  }, 30_000);

  test('a value the database would refuse as a full ID is refused by the database before anything is written, naming the field (D11)', async () => {
    asMember();
    const parties = await count(`parties?household_id=eq.${household}&select=id`);
    const [, nextLine] = NATIONAL_ID_VECTORS.refused.find(([name]) => name.startsWith('a next-line')) ?? [];
    const cases = [
      ...NATIONAL_ID_VECTORS.refused.map(([name, text]) => ({ name, path: 'parcels[0].origin_text', text })),
      { name: 'the issuer with a next-line character', path: 'issued_by', text: nextLine ?? '' },
    ];
    for (const { name, path, text } of cases) {
      const { extractionId } = await waitingExtraction();
      expect(await saveExtractionReview(extractionId, { ...acceptAll, [path]: { kind: 'edited', value: text } }), name).toEqual({ ok: false, reason: 'national_id', paths: [path] });
      expect(await written(extractionId), name).toEqual({ certificates: 0, parcels: 0, structures: 0, parties });
      expect(await service(`document_extractions?id=eq.${extractionId}&select=status,accepted_fields`), name).toEqual([{ status: 'needs_review', accepted_fields: null }]);
    }
  }, 60_000);

  test('accepting a normal utility bill copies its printed text into ocr_text for search (DOC-3)', async () => {
    asMember();
    const { documentId, extractionId } = await waitingBill('normal');
    expect(await saveExtractionReview(extractionId, acceptBill)).toEqual({ ok: true, propertyId });
    expect(await ocrText(documentId)).toBe(BILL_TEXT);
  });

  test('the same bill marked sensitive keeps ocr_text null', async () => {
    asMember();
    const { documentId, extractionId } = await waitingBill('sensitive');
    expect(await saveExtractionReview(extractionId, acceptBill)).toEqual({ ok: true, propertyId });
    expect(await ocrText(documentId)).toBeNull();
  });

  test('accepting a certificate leaves ocr_text null', async () => {
    asMember();
    const { documentId, extractionId } = await waitingExtraction();
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: true, propertyId });
    expect(await ocrText(documentId)).toBeNull();
  });

  test('a viewer and a member of another household write nothing', async () => {
    const { extractionId } = await waitingExtraction();
    session.client = member;
    session.member = { role: 'viewer', household: { id: household } };
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: false, reason: 'forbidden' });
    session.client = outsider;
    session.member = { role: 'admin', household: { id: household } };
    expect(await saveExtractionReview(extractionId, acceptAll)).toEqual({ ok: false, reason: 'not_reviewable' });
    expect(await written(extractionId)).toMatchObject({ certificates: 0, parcels: 0 });
    expect(await service(`document_extractions?id=eq.${extractionId}&select=status`)).toEqual([{ status: 'needs_review' }]);
  });
});
