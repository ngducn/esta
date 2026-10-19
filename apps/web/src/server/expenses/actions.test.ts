import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
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
vi.mock('@/server/clock', () => ({ readRequestClock: async () => ({ now: () => '2026-10-07T09:00:00+07:00', today: () => '2026-10-07' }) }));
vi.mock('@/server/member', () => ({ requireMember: async () => session.member }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => session.client }));

const { createExpense, deleteExpense, restoreExpense } = await import('./actions');

// The vitest config's placeholder Supabase URL and key would shadow the slot's real ones.
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
const env = slotEnv(join(import.meta.dirname, '../../../../..'), parseSlot(process.env.ESTA_SLOT));
vi.unstubAllEnvs();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const stackUp = anonKey !== '' && (await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }).then((r) => r.ok, () => false));

const LANE = 6;
const household = seedId(`seed:household:lane-${LANE}`);
const propertyId = seedId(`seed:property:lane-${LANE}:q7`);
const created: string[] = [];
const vendors: string[] = [];

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

function sheet(amount: string) {
  const id = randomUUID();
  created.push(id);
  return { id, propertyId, category: 'repair', amount, paidOn: '07/10/2026', vendor: null, documentId: null, note: '' };
}

describe.skipIf(!stackUp)(`expense actions against the ESTA_SLOT=${process.env.ESTA_SLOT ?? 0} stack`, () => {
  let member: SupabaseClient;

  beforeAll(async () => {
    member = await signedInAs(`ryan.lane${LANE}@demo.esta.test`);
    session.client = member;
    session.member = { role: 'member', household: { id: household } };
  });

  afterAll(async () => {
    if (created.length > 0) await service(`/rest/v1/expenses?id=in.(${created.join(',')})`, { method: 'DELETE' });
    if (vendors.length > 0) await service(`/rest/v1/parties?id=in.(${vendors.join(',')})`, { method: 'DELETE' });
  });

  test('a retried createExpense with the same id writes one row and reports the amount stored', async () => {
    const input = sheet('2tr5');
    const first = await createExpense(input);
    const retry = await createExpense({ ...input, amount: '9tr' });
    expect(first).toEqual({ ok: true, expense: { id: input.id, amountVnd: 2_500_000 } });
    expect(retry).toEqual(first);
    expect(await service(`/rest/v1/expenses?id=eq.${input.id}&select=amount_vnd,paid_on,household_id`)).toEqual([
      { amount_vnd: 2_500_000, paid_on: '2026-10-07', household_id: household },
    ]);
  });

  test('a vendor added in the sheet is saved once, tagged contractor, under the id the sheet minted', async () => {
    const vendor = { kind: 'new', id: randomUUID(), fullName: 'Thợ điện Demo Phường Tân Đông Hiệp' };
    vendors.push(vendor.id);
    const input = { ...sheet('850k'), vendor };
    expect(await createExpense(input)).toMatchObject({ ok: true });
    expect(await createExpense(input)).toMatchObject({ ok: true });
    expect(await service(`/rest/v1/parties?id=eq.${vendor.id}&select=full_name,tags,household_id`)).toEqual([
      { full_name: 'Thợ điện Demo Phường Tân Đông Hiệp', tags: ['contractor'], household_id: household },
    ]);
    expect(await service(`/rest/v1/expenses?id=eq.${input.id}&select=vendor_party_id`)).toEqual([{ vendor_party_id: vendor.id }]);
  });

  test('delete sets deleted_at and restore brings the same row back', async () => {
    const input = sheet('1tr2');
    expect(await createExpense(input)).toMatchObject({ ok: true });
    const listed = async () => (await member.from('expenses').select('id').eq('id', input.id).is('deleted_at', null)).data;
    expect(await deleteExpense(input.id)).toEqual({ ok: true });
    expect(await listed()).toEqual([]);
    expect(await service(`/rest/v1/expenses?id=eq.${input.id}&select=deleted_at`)).toEqual([{ deleted_at: '2026-10-07T02:00:00+00:00' }]);
    expect(await restoreExpense(input.id)).toEqual({ ok: true });
    expect(await listed()).toEqual([{ id: input.id }]);
  });

  test('an amount of 0 is refused on the amount field and writes nothing', async () => {
    const input = sheet('0');
    expect(await createExpense(input)).toEqual({ ok: false, reason: 'invalid', problems: { amount: 'not_positive' } });
    expect(await service(`/rest/v1/expenses?id=eq.${input.id}&select=id`)).toEqual([]);
  });

  test('a viewer cannot save an expense', async () => {
    session.member = { role: 'viewer', household: { id: household } };
    try {
      expect(await createExpense(sheet('500k'))).toEqual({ ok: false, reason: 'forbidden' });
    } finally {
      session.member = { role: 'member', household: { id: household } };
    }
  });
});
