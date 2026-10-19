import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { e2eServiceHeaders } from '../../../../../scripts/e2e-service';
import { parseSlot } from '../../../../../scripts/slot';
import { slotEnv } from '../../../../../scripts/slot-env';
import { seedId } from '../../../../../supabase/seed/generator/ids';

const session = vi.hoisted(() => ({ client: null as unknown, member: { role: 'member', household: { id: '' } } }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => () => 'Sổ hồng' }));
vi.mock('@/server/env', () => ({ env: { ESTA_SIGNED_URL_TTL_SECONDS: 300 } }));
vi.mock('@/server/clock', () => ({ readRequestClock: async () => ({ now: () => '2026-10-07T09:00:00+07:00' }) }));
vi.mock('@/server/member', () => ({ requireMember: async () => session.member }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => session.client }));

const { createDocumentUpload } = await import('@/server/documents/actions');
const { startPropertyWizard } = await import('./wizard');

// The vitest config's placeholder Supabase URL and key would shadow the slot's real ones.
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
const env = slotEnv(join(import.meta.dirname, '../../../../..'), parseSlot(process.env.ESTA_SLOT));
vi.unstubAllEnvs();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const stackUp = anonKey !== '' && (await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }).then((r) => r.ok, () => false));

const LANE = 7;
const household = seedId(`seed:household:lane-${LANE}`);
const bytes = randomBytes(4096);
const file = { filename: 'so-hong.pdf', mime: 'application/pdf', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pageCount: 1 };
const propertyIds: string[] = [];
const documentIds: string[] = [];

async function signedInAs(email: string): Promise<SupabaseClient> {
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const { email_otp: token } = (await link.json()) as { email_otp: string };
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return client;
}

async function service<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...e2eServiceHeaders(), 'content-type': 'application/json', ...init.headers } });
  expect(response.ok, await response.clone().text()).toBe(true);
  return (await response.json().catch(() => null)) as T;
}

const put = (signedUrl: string, body: Buffer, type: string) =>
  fetch(signedUrl, { method: 'PUT', body: new Blob([new Uint8Array(body)]), headers: { 'content-type': type, 'x-upsert': 'true' } });

const code = () => `WZ${String(Date.now()).slice(-6)}`;

describe.skipIf(!stackUp)(`startPropertyWizard against the ESTA_SLOT=${process.env.ESTA_SLOT ?? 0} stack`, () => {
  beforeAll(async () => {
    session.client = await signedInAs(`me.lane${LANE}@demo.esta.test`);
    session.member = { role: 'admin', household: { id: household } };
  });

  afterAll(async () => {
    if (documentIds.length > 0) {
      await service(`/rest/v1/agent_jobs?household_id=eq.${household}&payload->>document_id=in.(${documentIds.join(',')})`, { method: 'DELETE' });
      await service(`/rest/v1/documents?id=in.(${documentIds.join(',')})`, { method: 'DELETE' });
      const names = documentIds.flatMap((id) => [`${household}/${id}/${file.filename}`]);
      await service('/storage/v1/object/documents', { method: 'DELETE', body: JSON.stringify({ prefixes: names }) });
    }
    if (propertyIds.length > 0) await service(`/rest/v1/properties?id=in.(${propertyIds.join(',')})`, { method: 'DELETE' });
  });

  test('called twice with one id it leaves one property, one document and one extraction', async () => {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const ticket = await createDocumentUpload({ ...file, propertyId, category: 'certificate' });
    if (!ticket.ok) throw new Error('createDocumentUpload refused');
    documentIds.push(ticket.documentId);
    expect((await put(ticket.file.url, bytes, file.mime)).status).toBe(200);
    const input = { propertyId, nickname: 'Nhà kiểm thử Demo', code: code(), kind: 'rooming_house', document: { ...file, documentId: ticket.documentId } };

    const first = await startPropertyWizard(input);
    const second = await startPropertyWizard(input);
    expect(first).toEqual({ ok: true, propertyId, documentId: ticket.documentId });
    expect(second).toEqual(first);

    expect(await service<unknown[]>(`/rest/v1/properties?id=eq.${propertyId}&select=id`)).toHaveLength(1);
    const documents = await service<{ property_id: string; category: string; sensitivity: string }[]>(
      `/rest/v1/documents?id=eq.${ticket.documentId}&select=property_id,category,sensitivity`,
    );
    expect(documents).toEqual([{ property_id: propertyId, category: 'certificate', sensitivity: 'sensitive' }]);
    expect(await service<unknown[]>(`/rest/v1/document_extractions?document_id=eq.${ticket.documentId}&select=id`)).toHaveLength(1);
    expect(await service<unknown[]>(`/rest/v1/agent_jobs?kind=eq.extract_document&payload->>document_id=eq.${ticket.documentId}&select=id`)).toHaveLength(1);
  });

  test('a skipped photo creates the property alone, and a retry adds no second row', async () => {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const input = { propertyId, nickname: 'Nhà không ảnh Demo', code: code(), kind: 'townhouse', document: null };
    expect(await startPropertyWizard(input)).toEqual({ ok: true, propertyId, documentId: null });
    expect(await startPropertyWizard(input)).toEqual({ ok: true, propertyId, documentId: null });
    expect(await service<unknown[]>(`/rest/v1/properties?id=eq.${propertyId}&select=id`)).toHaveLength(1);
    expect(await service<unknown[]>(`/rest/v1/documents?property_id=eq.${propertyId}&select=id`)).toEqual([]);
  });

  test('a code another property holds is refused with that property named', async () => {
    const [taken] = await service<{ code: string; nickname: string }[]>(`/rest/v1/properties?household_id=eq.${household}&deleted_at=is.null&select=code,nickname&limit=1`);
    const propertyId = randomUUID();
    const result = await startPropertyWizard({ propertyId, nickname: 'Trùng mã Demo', code: taken?.code, kind: 'townhouse', document: null });
    expect(result).toEqual({ ok: false, reason: 'code_taken', code: taken?.code, takenBy: taken?.nickname });
    expect(await service<unknown[]>(`/rest/v1/properties?id=eq.${propertyId}&select=id`)).toEqual([]);
  });

  test('a viewer cannot start the wizard', async () => {
    session.member = { role: 'viewer', household: { id: household } };
    try {
      expect(await startPropertyWizard({ propertyId: randomUUID(), nickname: 'Demo', code: code(), kind: 'townhouse', document: null })).toEqual({ ok: false, reason: 'forbidden' });
    } finally {
      session.member = { role: 'admin', household: { id: household } };
    }
  });
});
