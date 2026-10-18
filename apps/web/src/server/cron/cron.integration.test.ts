import { clockAt, parseInstant } from '@esta/core';
import { isoDate, type IsoDate } from '@esta/core/date';
import { planInvoices, type InvoicingLease } from '@esta/core/lease';
import { leaseRowSchema, leaseTerms, LEASE_COLUMNS } from '@esta/core/schemas/lease';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// `pnpm test:integration` (scripts/web-integration.ts) runs this file last, against a fresh `pnpm db:reset`: it moves
// every household's invoices on to 31/12/2026 and household 6's well past it.
const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_SERVICE_ROLE_KEY: serviceRoleKey } = z
  .object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_SERVICE_ROLE_KEY: z.string().min(1) })
  .parse(process.env);
const SECRET = 'cron-integration-secret';
// seedId('seed:household:lane-6'), supabase/seed/README.md
const HOUSEHOLD = '7a44c0c3-e063-5cf0-b56d-c33c5f915ddd';
const HOUSEHOLDS = 11;

let frozenNow = '2026-10-07T09:00:00+07:00';
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
vi.mock('server-only', () => ({}));
vi.mock('@/server/env', () => ({ env: { CRON_SECRET: SECRET, NEXT_PUBLIC_SUPABASE_URL: url } }));
vi.mock('@/server/clock', () => ({
  readRequestClock: async () => clockAt({ kind: 'table', now: parseInstant(frozenNow) }, 'Asia/Ho_Chi_Minh'),
}));

const invoicesRoute = await import('@/app/api/cron/invoices/route');
const leaseStatusRoute = await import('@/app/api/cron/lease-status/route');

/** Fixture writes name their own actor, so the audit check below sees only what the cron wrote. */
const db: SupabaseClient<Database> = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-esta-actor': 'system:integration-test' } },
});

const authorized = (path: string) => new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}` } });

async function cron(at: string) {
  frozenNow = at;
  const leaseStatus: unknown = await (await leaseStatusRoute.GET(authorized('/api/cron/lease-status'))).json();
  const invoices: unknown = await (await invoicesRoute.GET(authorized('/api/cron/invoices'))).json();
  return { leaseStatus, invoices };
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: found, error } = await query;
  if (error || found === null) throw new Error(error?.message ?? 'no count');
  return found;
}

const counts = async () => ({
  total: await count(db.from('invoices').select('*', { count: 'exact', head: true })),
  issued: await count(db.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'issued')),
});

async function leaseIdsOf(code: string): Promise<string[]> {
  const properties = await rows(db.from('properties').select('id').eq('code', code));
  return (await rows(db.from('leases').select('id').in('property_id', properties.map((property) => property.id)))).map((lease) => lease.id);
}

const statuses = async () => new Map((await rows(db.from('leases').select('id, status, end_date'))).map((lease) => [lease.id, lease]));

describe('the nightly cron routes against local Supabase (SPEC §5.4, §7.4, LSE-2, LSE-3, LSE-5)', () => {
  it('refuses both routes without the secret or with a wrong one, by GET and by POST', async () => {
    for (const route of [invoicesRoute, leaseStatusRoute]) {
      for (const handler of [route.GET, route.POST]) {
        expect((await handler(new Request('http://localhost/api/cron', { method: 'POST' }))).status).toBe(401);
        expect((await handler(new Request('http://localhost/api/cron', { headers: { authorization: `Bearer ${SECRET}x` } }))).status).toBe(401);
      }
    }
  });

  it('changes nothing at the seed date 07/10/2026, because the seed already holds every invoice the cron would write', async () => {
    const before = await counts();
    expect(await cron('2026-10-07T09:00:00+07:00')).toEqual({
      leaseStatus: { ok: true, as_of: '2026-10-07', ended: 0 },
      invoices: { ok: true, as_of: '2026-10-07', drafted: 0, issued: 0, households: HOUSEHOLDS },
    });
    expect(await counts()).toEqual(before);
  });

  it('on 02/11/2026 ends each Thủ Đức lease, drafts Dĩ An from 25/11 and issues Thủ Đức 01/11, then a second run does nothing', async () => {
    const [latestAudit] = await rows(db.from('audit_log').select('id').order('id', { ascending: false }).limit(1));
    const leasesBefore = await statuses();
    const before = await counts();

    const first = await cron('2026-11-02T00:30:00+07:00');
    const after = await counts();
    expect(first).toEqual({
      leaseStatus: { ok: true, as_of: '2026-11-02', ended: HOUSEHOLDS },
      invoices: { ok: true, as_of: '2026-11-02', drafted: after.total - before.total, issued: after.issued - before.issued, households: HOUSEHOLDS },
    });

    const thuDuc = new Set(await leaseIdsOf('THUDUC'));
    const changed = [...(await statuses())].filter(([id, lease]) => leasesBefore.get(id)?.status !== lease.status);
    expect(changed.map(([id, lease]) => [thuDuc.has(id), lease.status])).toEqual(Array.from({ length: HOUSEHOLDS }, () => [true, 'ended']));

    const thuDucNovember = await rows(db.from('invoices').select('status, issued_at').in('lease_id', [...thuDuc]).eq('period_start', '2026-11-01'));
    expect(thuDucNovember).toEqual(Array.from({ length: HOUSEHOLDS }, () => ({ status: 'issued', issued_at: '2026-11-01T17:30:00+00:00' })));

    const diAn = await rows(
      db.from('invoices').select('status, invoice_lines(kind, amount_vnd)').in('lease_id', await leaseIdsOf('DIAN')).eq('period_start', '2026-11-25'),
    );
    expect(diAn).toHaveLength(6 * HOUSEHOLDS);
    for (const invoice of diAn) {
      expect(invoice.status, 'October readings are missing, so the period waits for its due date').toBe('draft');
      expect(invoice.invoice_lines.map((line) => line.kind)).toEqual(['rent']);
    }

    const written = await rows(db.from('audit_log').select('table_name, actor_kind, actor_id').gt('id', latestAudit?.id ?? 0));
    expect(written.length).toBeGreaterThan(HOUSEHOLDS);
    expect(new Set(written.map((row) => `${row.actor_kind}:${row.actor_id}`))).toEqual(new Set(['system:cron']));

    expect(await cron('2026-11-02T09:00:00+07:00')).toEqual({
      leaseStatus: { ok: true, as_of: '2026-11-02', ended: 0 },
      invoices: { ok: true, as_of: '2026-11-02', drafted: 0, issued: 0, households: HOUSEHOLDS },
    });
    expect(await counts()).toEqual(after);
  });

  it('on 31/12/2026 drafts Q7 from 01/01/2027 and nothing for a period Q7 already paid through', async () => {
    const q7 = await leaseIdsOf('Q7');
    const before = new Set((await rows(db.from('invoices').select('id').in('lease_id', q7))).map((invoice) => invoice.id));
    await cron('2026-12-31T09:00:00+07:00');
    const after = await rows(db.from('invoices').select('id, period_start, period_end, status').in('lease_id', q7));
    const added = after.filter((invoice) => !before.has(invoice.id)).map(({ id: _id, ...invoice }) => invoice);
    expect(added).toEqual(Array.from({ length: HOUSEHOLDS }, () => ({ period_start: '2027-01-01', period_end: '2027-03-31', status: 'draft' })));
  });
});

type Planned = { period_start: string; period_end: string; due_date: string; issue_on: string; status: string; rent_vnd: number };

/** What the cron writes over successive nights by packages/core: each night's plan, less any stretch already billed. */
function nightly(lease: InvoicingLease, nights: readonly IsoDate[]): Planned[] {
  const billed: Omit<Planned, 'status'>[] = [];
  for (const night of nights) {
    for (const invoice of planInvoices(lease, [], night)) {
      if (billed.some((done) => done.period_start <= invoice.periodEnd && invoice.periodStart <= done.period_end)) continue;
      billed.push({
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        due_date: invoice.dueDate,
        issue_on: invoice.issueOn,
        rent_vnd: invoice.lines[0]?.amountVnd ?? 0,
      });
    }
  }
  const last = nights.at(-1) ?? '';
  return billed.map((invoice) => ({ ...invoice, status: invoice.issue_on <= last ? 'issued' : 'draft' })).toSorted((a, b) => a.period_start.localeCompare(b.period_start));
}

describe('public.run_invoicing against packages/core planInvoices over the nights the cron runs', () => {
  const NIGHTS = ['2026-10-07', '2026-11-02', '2026-12-31', '2027-02-01', '2027-04-20', '2027-05-02'].map(isoDate);
  let propertyId = '';
  let unitId = '';
  let tenantId = '';

  beforeAll(async () => {
    const code = `CR${String(Date.now()).slice(-8)}`;
    const property = await db.from('properties').insert({ household_id: HOUSEHOLD, nickname: `Nhà kiểm thử Demo ${code}`, code, kind: 'townhouse', use_mode: 'rental' }).select('id').single();
    if (property.error) throw property.error;
    propertyId = property.data.id;
    const unit = await db.from('units').select('id').eq('property_id', propertyId).single();
    if (unit.error) throw unit.error;
    unitId = unit.data.id;
    const tenant = await db.from('parties').insert({ household_id: HOUSEHOLD, kind: 'individual', full_name: 'Người thuê kiểm thử Demo', tags: ['tenant'] }).select('id').single();
    if (tenant.error) throw tenant.error;
    tenantId = tenant.data.id;
  }, 30_000);

  it('writes on every night exactly the invoices the TypeScript planner plans, across cycles, anchors, prorations, rent increases and paid-through dates', async () => {
    const cases = [1, 3, 12].flatMap((billing_cycle_months) =>
      (['calendar_month', 'lease_start'] as const).flatMap((period_anchor) =>
        (
          [
            ['2025-01-31', null, { kind: 'none' }],
            ['2025-12-10', '2027-04-15', { kind: 'percent', value: 500, every_months: 12 }],
            ['2026-10-16', null, { kind: 'fixed', value: 250_000, every_months: 6 }],
          ] as const
        ).flatMap(([start_date, end_date, escalation]) =>
          [null, '2026-09-30', '2026-10-20', '2026-11-30'].map((paid_through_date) => ({
            household_id: HOUSEHOLD,
            property_id: propertyId,
            unit_id: unitId,
            tenant_party_id: tenantId,
            start_date,
            end_date,
            rent_vnd: 3_333_333,
            billing_cycle_months,
            period_anchor,
            first_period_proration: billing_cycle_months === 3 ? 'none' : 'by_days',
            due_offset_days: period_anchor === 'lease_start' ? 5 : 0,
            escalation,
            utilities_mode: period_anchor === 'lease_start' ? 'metered_by_owner' : 'tenant_direct',
            paid_through_date: paid_through_date !== null && paid_through_date < start_date ? null : paid_through_date,
            status: 'active',
          })),
        ),
      ),
    );
    const inserted = await db.from('leases').insert(cases).select(LEASE_COLUMNS);
    if (inserted.error) throw inserted.error;

    for (const [index, night] of NIGHTS.entries()) {
      const run = await db.rpc('run_invoicing', { p_household_id: HOUSEHOLD, p_as_of: night, p_issued_at: `${night}T00:30:00+07:00` }).single();
      if (run.error) throw run.error;
      expect(run.data.drafted, `night ${index + 1} drafts something`).toBeGreaterThan(0);
    }

    let compared = 0;
    let increased = 0;
    for (const row of inserted.data.map((value) => leaseRowSchema.parse(value))) {
      const terms = leaseTerms(row);
      if (terms === null) throw new Error('every case has its start and rent');
      const expected = nightly({ ...terms, utilitiesMode: row.utilities_mode }, NIGHTS);
      const written = await rows(
        db.from('invoices').select('period_start, period_end, due_date, issue_on, status, invoice_lines(amount_vnd)').eq('lease_id', row.id).order('period_start'),
      );
      const actual = written.map(({ invoice_lines, ...invoice }) => ({ ...invoice, rent_vnd: invoice_lines[0]?.amount_vnd }));
      expect(actual, JSON.stringify(terms)).toEqual(expected);
      compared += expected.length;
      if (terms.escalation.kind !== 'none') increased += expected.filter((invoice) => invoice.rent_vnd > terms.rentVnd * terms.billingCycleMonths).length;
    }
    expect(compared).toBeGreaterThan(250);
    expect(increased, 'some compared invoices bill an increased rent (#130)').toBeGreaterThan(10);
  }, 120_000);
});
