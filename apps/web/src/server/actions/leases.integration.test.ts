import { isoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import { planInvoices } from '@esta/core/lease';
import { leaseRowSchema, leaseTerms, LEASE_COLUMNS } from '@esta/core/schemas/lease';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// AS_OF_INSTANT; run against a fresh `pnpm db:reset`.
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
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: HOUSEHOLD } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));

const { activateLease, createTenant, previewActivation, saveLease } = await import('./leases');
const AS_OF = isoDate('2026-10-07');

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

  it('refuses a tenant name holding a full ID before any write, naming the name (D11)', async () => {
    const name = 'Lê Văn Demo CCCD 079123456789';
    expect(await createTenant({ full_name: name, phone: '0903 123 456' })).toEqual({ ok: false, reason: 'national_id' });
    const { data } = await client.from('parties').select('id').eq('household_id', HOUSEHOLD).eq('full_name', name);
    expect(data).toEqual([]);
  });

  it('refuses to activate a draft without rent and leaves it a draft', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, null));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await activateLease(saved.id, '30/09/2026')).toEqual({ ok: false, reasons: ['missing_rent'] });
    const { data } = await client.from('leases').select('status').eq('id', saved.id).single();
    expect(data?.status).toBe('draft');
    expect(await invoicesOf(saved.id)).toEqual([]);
    await client.from('leases').delete().eq('id', saved.id);
  });

  it('refuses a paid-through date of 31/09/2026 and leaves the lease a draft with no invoice', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, 3_000_000));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await activateLease(saved.id, '31/09/2026')).toEqual({ ok: false, reasons: ['paid_through_invalid'] });
    const { data } = await client.from('leases').select('status, paid_through_date').eq('id', saved.id).single();
    expect(data).toEqual({ status: 'draft', paid_through_date: null });
    expect(await invoicesOf(saved.id)).toEqual([]);
    await client.from('leases').delete().eq('id', saved.id);
  });

  it('LSE-3: activating on 2026-10-07 paid through 2026-09-30 issues one October invoice due 2026-10-01, and a second call inserts nothing', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, 3_000_000));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await activateLease(saved.id, '30/09/2026')).toEqual({ ok: true, issuedMonth: '2026-10-01' });
    const first = await invoicesOf(saved.id);
    expect(first.filter((invoice) => invoice.status === 'issued').map(({ period_start, due_date }) => ({ period_start, due_date }))).toEqual([
      { period_start: '2026-10-01', due_date: '2026-10-01' },
    ]);
    expect(first.map((invoice) => invoice.status)).toEqual(['issued', 'draft']);

    expect(await activateLease(saved.id, '31/10/2026')).toEqual({ ok: false, reasons: ['already_active'] });
    expect(await invoicesOf(saved.id)).toEqual(first);
    const { data } = await client.from('leases').select('paid_through_date').eq('id', saved.id).single();
    expect(data?.paid_through_date).toBe('2026-09-30');
  });

  it('refuses a rent of 0', async () => {
    expect(await saveLease(propertyId, null, draft(unitId, tenantId, 0))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('previews on the database clock exactly what packages/core planInvoices plans, across cycles, anchors, prorations, increases and paid-through dates', async () => {
    const { data: clock } = await client.from('test_clock').select('frozen_now').maybeSingle();
    expect(clock?.frozen_now, 'scripts/web-integration.ts sets the database clock').toBe('2026-10-07T02:00:00+00:00');
    const cases = [1, 3, 12].flatMap((billing_cycle_months) =>
      (['calendar_month', 'lease_start'] as const).flatMap((period_anchor) =>
        (
          [
            ['2025-01-31', null, { kind: 'none' }],
            ['2026-08-10', '2027-01-15', { kind: 'percent', value: 500, every_months: 12 }],
            ['2026-10-16', null, { kind: 'fixed', value: 250_000, every_months: 6 }],
          ] as const
        ).map(([start_date, end_date, escalation]) => ({
          ...draft(unitId, tenantId, 3_333_333),
          start_date,
          end_date,
          billing_cycle_months,
          period_anchor,
          first_period_proration: billing_cycle_months === 3 ? 'none' : 'by_days',
          escalation,
          utilities_mode: period_anchor === 'lease_start' ? 'metered_by_owner' : 'tenant_direct',
        })),
      ),
    );
    const { data, error } = await client.from('leases').insert(cases.map((value) => ({ ...value, household_id: HOUSEHOLD, property_id: propertyId }))).select(LEASE_COLUMNS);
    if (error) throw error;
    const rows = data.map((row) => leaseRowSchema.parse(row));
    let compared = 0;
    for (const row of rows) {
      for (const paidThrough of [null, '2026-09-30', '2026-10-20', '2026-11-30'] as const) {
        const terms = leaseTerms(row);
        if (terms === null) throw new Error('every case has its start and rent');
        const expected = planInvoices({ ...terms, paidThroughDate: paidThrough === null ? null : isoDate(paidThrough), utilitiesMode: row.utilities_mode }, [], AS_OF).map(
          (invoice) => ({ periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, dueDate: invoice.dueDate, rentVnd: invoice.lines[0]?.amountVnd, issuesNow: invoice.issueOn <= AS_OF }),
        );
        const typed = paidThrough === null ? '' : formatDate(isoDate(paidThrough), 'vi');
        expect(await previewActivation(row.id, typed), `${JSON.stringify({ ...terms, paidThrough })}`).toEqual(expected);
        compared += expected.length;
      }
    }
    expect(compared).toBeGreaterThan(50);
    await client.from('leases').delete().in('id', rows.map((row) => row.id));
  });
});
