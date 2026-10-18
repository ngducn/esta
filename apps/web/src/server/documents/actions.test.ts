import { NATIONAL_ID_VECTORS } from '../../../../../packages/core/src/agent-schemas/national-id-vectors';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
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
vi.mock('@/server/env', () => ({ env: { ESTA_SIGNED_URL_TTL_SECONDS: 2 } }));
vi.mock('@/server/clock', () => ({ readRequestClock: async () => ({ now: () => '2026-10-07T09:00:00+07:00' }) }));
vi.mock('@/server/member', () => ({ requireMember: async () => session.member }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => session.client }));

const { createDocumentUpload, openDocument, registerDocument, updateDocument } = await import('./actions');

// The vitest config's placeholder Supabase URL and key would shadow the slot's real ones.
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
const bytes = randomBytes(2048);
const file = { filename: 'giay-to.pdf', mime: 'application/pdf', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
const created: string[] = [];

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

async function uploadAndRegister() {
  const ticket = await createDocumentUpload({ ...file, propertyId, category: 'other' });
  if (!ticket.ok) throw new Error('createDocumentUpload refused');
  created.push(ticket.documentId);
  expect((await put(ticket.file.url, bytes, file.mime)).status).toBe(200);
  const input = { ...file, propertyId, category: 'other', documentId: ticket.documentId, title: 'Giấy tờ Demo', expiresOn: null, sensitive: false, pageCount: 1 };
  return { ticket, input };
}

describe.skipIf(!stackUp)(`document actions against the ESTA_SLOT=${process.env.ESTA_SLOT ?? 0} stack`, () => {
  let member: SupabaseClient;
  let outsider: SupabaseClient;

  beforeAll(async () => {
    member = await signedInAs(`me.lane${LANE}@demo.esta.test`);
    outsider = await signedInAs('me.lane8@demo.esta.test');
    session.client = member;
    session.member = { role: 'member', household: { id: household } };
  });

  afterAll(async () => {
    if (created.length === 0) return;
    await service(`/rest/v1/documents?id=in.(${created.join(',')})`, { method: 'DELETE' });
    const names = created.flatMap((id) => [`${household}/${id}/giay-to.pdf`, `${household}/${id}/thumb.webp`, `${household}/${id}/thumb-blur.webp`]);
    await service('/storage/v1/object/documents', { method: 'DELETE', body: JSON.stringify({ prefixes: names }) });
  });

  test('registering the same upload twice leaves one row, and the next upload of those bytes is warned as a duplicate', async () => {
    const { ticket, input } = await uploadAndRegister();
    expect(await registerDocument(input)).toEqual({ ok: true, title: 'Giấy tờ Demo' });
    expect(await registerDocument(input)).toEqual({ ok: true, title: 'Giấy tờ Demo' });
    expect(await service<unknown[]>(`/rest/v1/documents?id=eq.${ticket.documentId}&select=id`)).toHaveLength(1);
    const again = await createDocumentUpload({ ...file, propertyId, category: 'other' });
    expect(again.ok && again.duplicates).toEqual([{ id: ticket.documentId, title: 'Giấy tờ Demo' }]);
  });

  test('a registered file cannot be rewritten through the upload URL it was sent with', async () => {
    const { ticket, input } = await uploadAndRegister();
    expect(await registerDocument(input)).toMatchObject({ ok: true });
    expect((await put(ticket.file.url, randomBytes(16), file.mime)).ok).toBe(false);
    const { data: stored } = await member.storage.from('documents').download(`${household}/${ticket.documentId}/giay-to.pdf`);
    expect(stored && Buffer.from(await stored.arrayBuffer()).equals(bytes)).toBe(true);
  });

  test('an open signs a URL that works now and fails after its TTL of 2 s, with one access log row per open (DOC-4)', async () => {
    const { ticket, input } = await uploadAndRegister();
    expect(await registerDocument(input)).toMatchObject({ ok: true });
    const views = () => service<unknown[]>(`/rest/v1/document_access_log?document_id=eq.${ticket.documentId}&action=eq.view&select=id`);
    const signed = (await openDocument(ticket.documentId)) ?? '';
    expect(signed).toMatch(/token=/);
    expect((await fetch(signed)).status).toBe(200);
    expect(await views()).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect((await fetch(signed)).status).toBe(400);
    expect(await openDocument(ticket.documentId)).not.toBeNull();
    expect(await views()).toHaveLength(2);
  }, 15_000);

  test('a member of another household gets no URL and writes no access log row (FND-2)', async () => {
    const { ticket, input } = await uploadAndRegister();
    expect(await registerDocument(input)).toMatchObject({ ok: true });
    session.client = outsider;
    try {
      expect(await openDocument(ticket.documentId)).toBeNull();
    } finally {
      session.client = member;
    }
    expect(await service<unknown[]>(`/rest/v1/document_access_log?document_id=eq.${ticket.documentId}&select=id`)).toEqual([]);
  });

  test('Sửa thông tin refuses a title or a tag holding a full ID, names the field and writes nothing (D11)', async () => {
    const { ticket, input } = await uploadAndRegister();
    expect(await registerDocument(input)).toMatchObject({ ok: true });
    const edit = { documentId: ticket.documentId, title: 'Giấy tờ Demo', category: 'other', propertyId, expiresOn: null, tags: ['demo'], sensitive: false };
    const [, judgedOnly] = NATIONAL_ID_VECTORS.refused.find(([name]) => name.startsWith('a next-line')) ?? [];
    const titles = ['CCCD mẹ 079123456789', 'số 079123\u0301456789', judgedOnly ?? ''];
    for (const title of titles) {
      expect(await updateDocument({ ...edit, title }), title).toEqual({ ok: false, reason: 'national_id', fields: ['title'] });
    }
    expect(await updateDocument({ ...edit, tags: ['demo', '079123456789'] })).toEqual({ ok: false, reason: 'national_id', fields: ['tags'] });
    expect(await updateDocument({ ...edit, title: titles[0], tags: ['CMND 023456789'] })).toEqual({ ok: false, reason: 'national_id', fields: ['title', 'tags'] });
    expect(await service(`/rest/v1/documents?id=eq.${ticket.documentId}&select=title,tags`)).toEqual([{ title: 'Giấy tờ Demo', tags: [] }]);
    expect(await updateDocument({ ...edit, title: 'Giấy tờ Demo CCCD 6789' })).toMatchObject({ ok: true });
    expect(await service(`/rest/v1/documents?id=eq.${ticket.documentId}&select=title,tags`)).toEqual([{ title: 'Giấy tờ Demo CCCD 6789', tags: ['demo'] }]);
  });
});
