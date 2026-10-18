import { clockAt, parseInstant } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack; run against a fresh `pnpm db:reset`.
const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_ANON_KEY: anonKey, ESTA_IT_MAILBOX: mailbox } = z
  .object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1), ESTA_IT_MAILBOX: z.url() })
  .parse(process.env);
const EMAIL = 'ryan.lane3@demo.esta.test';
// seedId('seed:household:lane-3'), supabase/seed/README.md
const HOUSEHOLD = '77551982-f791-5e3b-8cc6-0622735344d4';
const client: SupabaseClient<Database> = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const search = new URLSearchParams({ query: `to:"${EMAIL}"` }).toString();

async function latestCode(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = z.object({ messages: z.array(z.object({ ID: z.string() })) }).parse(await (await fetch(`${mailbox}/search?${search}`)).json());
    const [newest] = found.messages;
    if (newest !== undefined) {
      const { Text } = z.object({ Text: z.string() }).parse(await (await fetch(`${mailbox}/message/${newest.ID}`)).json());
      const code = /\b\d{6}\b/.exec(Text)?.[0];
      if (code !== undefined) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code reached ${EMAIL}`);
}

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/clock', () => ({ readRequestClock: async () => clockAt({ kind: 'env', now: parseInstant('2026-10-07T09:00:00+07:00') }, 'Asia/Ho_Chi_Minh') }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: HOUSEHOLD } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));

const { activateLease, createTenant, saveLease } = await import('./leases');

const draft = (unitId: string, tenantId: string, rent: number | null) => ({
  unit_id: unitId,
  tenant_party_id: tenantId,
  start_date: '2026-08-01',
  end_date: null,
  rent_vnd: rent,
  billing_cycle_months: 1,
  period_anchor: 'calendar_month',
  first_period_proration: 'by_days',
  deposit_vnd: null,
  escalation: { kind: 'none' },
  utilities_mode: 'tenant_direct',
  tax_payer: 'owner',
  notice_days: 30,
});

let propertyId = '';
let unitId = '';
let tenantId = '';

async function invoicesOf(leaseId: string) {
  const { data, error } = await client.from('invoices').select('id, period_start, due_date, status').eq('lease_id', leaseId).order('period_start');
  if (error) throw error;
  return data;
}

/** Signs in through the slot's mailbox like a person, so every write below runs under RLS as a household admin. */
beforeAll(async () => {
  await fetch(`${mailbox}/search?${search}`, { method: 'DELETE' });
  const sent = await client.auth.signInWithOtp({ email: EMAIL, options: { shouldCreateUser: false } });
  if (sent.error) throw sent.error;
  const verified = await client.auth.verifyOtp({ email: EMAIL, token: await latestCode(), type: 'email' });
  if (verified.error) throw verified.error;
  const code = `IT${String(Date.now()).slice(-8)}`;
  const property = await client
    .from('properties')
    .insert({ household_id: HOUSEHOLD, nickname: `Nhà kiểm thử Demo ${code}`, code, kind: 'townhouse', use_mode: 'rental' })
    .select('id')
    .single();
  if (property.error) throw property.error;
  propertyId = property.data.id;
  const unit = await client.from('units').select('id').eq('property_id', propertyId).single();
  if (unit.error) throw unit.error;
  unitId = unit.data.id;
}, 30_000);

afterAll(async () => {
  if (propertyId !== '') await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).eq('id', propertyId);
});

describe('lease actions against local Supabase (LSE-1 to LSE-3)', () => {
  it('quick-adds a tenant with the phone normalized', async () => {
    const tenant = await createTenant({ full_name: 'Lê Văn Demo', phone: '0903 123 456' });
    expect(tenant).toMatchObject({ ok: true, tenant: { fullName: 'Lê Văn Demo', phone: '0903 123 456' } });
    tenantId = tenant.ok ? tenant.tenant.id : '';
    const { data } = await client.from('parties').select('phone, tags').eq('id', tenantId).single();
    expect(data).toEqual({ phone: '+84903123456', tags: ['tenant'] });
  });

  it('refuses to activate a draft without rent and leaves it a draft', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, null));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await activateLease(saved.id, '2026-09-30')).toEqual({ ok: false, reasons: ['missing_rent'] });
    const { data } = await client.from('leases').select('status').eq('id', saved.id).single();
    expect(data?.status).toBe('draft');
    expect(await invoicesOf(saved.id)).toEqual([]);
    await client.from('leases').delete().eq('id', saved.id);
  });

  it('LSE-3: activating on 2026-10-07 paid through 2026-09-30 issues one October invoice due 2026-10-01, and a second call inserts nothing', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, 3_000_000));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await activateLease(saved.id, '2026-09-30')).toEqual({ ok: true, issuedMonth: '2026-10-01' });
    const first = await invoicesOf(saved.id);
    expect(first.filter((invoice) => invoice.status === 'issued').map(({ period_start, due_date }) => ({ period_start, due_date }))).toEqual([
      { period_start: '2026-10-01', due_date: '2026-10-01' },
    ]);
    expect(first.map((invoice) => invoice.status)).toEqual(['issued', 'draft']);

    expect(await activateLease(saved.id, '2026-09-30')).toEqual({ ok: true, issuedMonth: '2026-10-01' });
    expect(await invoicesOf(saved.id)).toEqual(first);
  });
});
