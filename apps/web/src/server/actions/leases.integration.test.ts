import { isoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import { parsePropertyFilters } from '@esta/core/properties';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memberClient } from '@/test/member-client';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// AS_OF_INSTANT; run against a fresh `pnpm db:reset`.

// seedId('seed:household:lane-3'), supabase/seed/README.md
const HOUSEHOLD = '77551982-f791-5e3b-8cc6-0622735344d4';
const { client, signIn } = memberClient('ryan.lane3@demo.esta.test', HOUSEHOLD);

const { activateLease, amendLease, createTenant, previewActivation, renewLease, saveLease, terminateLease } = await import('./leases');
const { listProperties } = await import('@/server/properties/list');

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
const properties: string[] = [];

async function createProperty(): Promise<{ propertyId: string; unitId: string }> {
  const code = `IT${String(Date.now()).slice(-6)}${String(properties.length).padStart(2, '0')}`;
  const property = await client
    .from('properties')
    .insert({ household_id: HOUSEHOLD, nickname: `Nhà kiểm thử Demo ${code}`, code, kind: 'townhouse', use_mode: 'rental' })
    .select('id')
    .single();
  if (property.error) throw property.error;
  properties.push(property.data.id);
  const unit = await client.from('units').select('id').eq('property_id', property.data.id).single();
  if (unit.error) throw unit.error;
  return { propertyId: property.data.id, unitId: unit.data.id };
}

async function invoicesOf(leaseId: string) {
  const { data, error } = await client.from('invoices').select('id, period_start, due_date, status').eq('lease_id', leaseId).order('period_start');
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await signIn();
  ({ propertyId, unitId } = await createProperty());
}, 30_000);

afterAll(async () => {
  if (properties.length > 0) await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).in('id', properties);
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

  it('previews on the database clock what activation would bill, from the day after a typed paid-through date inside a period', async () => {
    const saved = await saveLease(propertyId, null, draft(unitId, tenantId, 3_000_000));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await previewActivation(saved.id, '20/10/2026')).toEqual([
      { periodStart: '2026-10-21', periodEnd: '2026-10-31', dueDate: '2026-10-21', rentVnd: 1_064_516, issuesNow: false },
      { periodStart: '2026-11-01', periodEnd: '2026-11-30', dueDate: '2026-11-01', rentVnd: 3_000_000, issuesNow: false },
    ]);
    await client.from('leases').delete().eq('id', saved.id);
  });
});

/** A lease on a property of its own, activated on the database clock's 2026-10-07 with the typed paid-through date. */
async function activeLease(values: Record<string, unknown>, paidThrough: string): Promise<{ id: string; propertyId: string }> {
  const unit = await createProperty();
  const saved = await saveLease(unit.propertyId, null, { ...draft(unit.unitId, tenantId, 3_000_000), ...values });
  if (!saved.ok) throw new Error(saved.reason);
  const activated = await activateLease(saved.id, paidThrough);
  if (!activated.ok) throw new Error(activated.reasons.join(', '));
  return { id: saved.id, propertyId: unit.propertyId };
}

/** What the property list shows for one property on a date: its contracted monthly rent and how many units are let. */
async function listed(propertyId: string, asOf: string) {
  const { rows } = await listProperties(HOUSEHOLD, parsePropertyFilters({}), isoDate(asOf));
  const row = rows.find((candidate) => candidate.id === propertyId);
  return row === undefined ? undefined : { monthlyRentVnd: row.monthlyRentVnd, leasedUnitCount: row.leasedUnitCount };
}

async function issuedOf(leaseId: string) {
  const { data, error } = await client.from('invoices').select('*, invoice_lines(*)').eq('lease_id', leaseId).eq('status', 'issued').order('period_start');
  if (error) throw error;
  return data;
}

async function billsOf(leaseId: string) {
  const { data, error } = await client
    .from('invoices')
    .select('period_start, period_end, due_date, issue_on, status, invoice_lines(amount_vnd)')
    .eq('lease_id', leaseId)
    .order('period_start');
  if (error) throw error;
  return data.map((invoice) => ({
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    dueDate: invoice.due_date,
    issueOn: invoice.issue_on,
    status: invoice.status,
    rentVnd: invoice.invoice_lines.reduce((sum, line) => sum + line.amount_vnd, 0),
  }));
}

describe('amend, terminate and renew against local Supabase (LSE-2, LSE-3, #144)', () => {
  it('LSE-2: an amendment from a later period plans its drafts again and leaves every issued invoice byte-identical', async () => {
    const lease = await activeLease({ end_date: '2027-07-31' }, '30/09/2026');
    const before = await issuedOf(lease.id);
    expect(before.map((invoice) => invoice.period_start)).toEqual(['2026-10-01']);

    expect(await amendLease(lease.id, { effectivePeriodStart: '2026-10-01', rentVnd: 3_300_000, reason: '' })).toEqual({ ok: false, reason: 'not_after_as_of' });
    expect(await amendLease(lease.id, { effectivePeriodStart: '2026-11-15', rentVnd: 3_300_000, reason: '' })).toEqual({ ok: false, reason: 'not_a_period_start' });
    expect(await amendLease(lease.id, { effectivePeriodStart: '2026-11-01', rentVnd: 3_300_000, reason: 'Phụ lục Demo' })).toEqual({ ok: true, value: undefined });
    expect(await amendLease(lease.id, { effectivePeriodStart: '2026-11-01', rentVnd: 3_400_000, reason: '' })).toEqual({ ok: false, reason: 'duplicate_effective_start' });

    expect(await issuedOf(lease.id)).toEqual(before);
    expect((await billsOf(lease.id)).map(({ periodStart, status, rentVnd }) => ({ periodStart, status, rentVnd }))).toEqual([
      { periodStart: '2026-10-01', status: 'issued', rentVnd: 3_000_000 },
      { periodStart: '2026-11-01', status: 'draft', rentVnd: 3_300_000 },
    ]);
    const { data } = await client.from('lease_amendments').select('effective_period_start, changes, reason').eq('lease_id', lease.id);
    expect(data).toEqual([{ effective_period_start: '2026-11-01', changes: { rent_vnd: 3_300_000 }, reason: 'Phụ lục Demo' }]);
  });

  it('#144: a member cannot write status, end date, paid-through date or amendments directly', async () => {
    const lease = await activeLease({ end_date: '2027-07-31' }, '30/09/2026');
    const status = await client.from('leases').update({ status: 'ended' }).eq('id', lease.id);
    expect(status.error?.code).toBe('42501');
    const end = await client.from('leases').update({ end_date: '2026-10-31' }).eq('id', lease.id);
    expect(end.error?.message).toBe('ESTA_LEASE_TERMS_LOCKED');
    const paid = await client.from('leases').update({ paid_through_date: '2026-12-31' }).eq('id', lease.id);
    expect(paid.error?.code).toBe('42501');
    const amendment = await client
      .from('lease_amendments')
      .insert({ household_id: HOUSEHOLD, lease_id: lease.id, effective_period_start: '2026-11-01', changes: { rent_vnd: 1 } });
    expect(amendment.error?.code).toBe('42501');
    const { data } = await client.from('leases').select('status, end_date, paid_through_date').eq('id', lease.id).single();
    expect(data).toEqual({ status: 'active', end_date: '2027-07-31', paid_through_date: '2026-09-30' });
  });

  it('LSE-2: a termination keeps the issued invoices, cuts the draft at its date, and an ended lease cannot be terminated', async () => {
    const lease = await activeLease({ end_date: '2027-07-31' }, '30/09/2026');
    const before = await issuedOf(lease.id);
    expect(await terminateLease(lease.id, { terminatedOn: '2026-11-15', reason: '  ' })).toEqual({ ok: false, reason: 'reason_required' });
    expect(await terminateLease(lease.id, { terminatedOn: '2026-11-15', reason: 'Người thuê chuyển đi' })).toEqual({ ok: true, value: { unbilled: 0 } });
    expect(await issuedOf(lease.id)).toEqual(before);
    expect((await billsOf(lease.id)).map(({ periodStart, periodEnd, status, rentVnd }) => ({ periodStart, periodEnd, status, rentVnd }))).toEqual([
      { periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'issued', rentVnd: 3_000_000 },
      { periodStart: '2026-11-01', periodEnd: '2026-11-15', status: 'draft', rentVnd: 1_500_000 },
    ]);
    const { data } = await client.from('leases').select('status, end_date, terminated_on, termination_reason').eq('id', lease.id).single();
    expect(data).toEqual({ status: 'terminated', end_date: '2026-11-15', terminated_on: '2026-11-15', termination_reason: 'Người thuê chuyển đi' });
    expect(await terminateLease(lease.id, { terminatedOn: '2026-11-20', reason: 'Lần hai' })).toEqual({ ok: false, reason: 'not_active' });

    const ended = await client.from('leases').select('id').eq('household_id', HOUSEHOLD).eq('status', 'ended').limit(1).single();
    if (ended.error) throw ended.error;
    expect(await terminateLease(ended.data.id, { terminatedOn: '2026-09-01', reason: 'Thử' })).toEqual({ ok: false, reason: 'not_active' });
    expect(await amendLease(ended.data.id, { effectivePeriodStart: '2026-11-25', rentVnd: 3_000_000, reason: '' })).toEqual({ ok: false, reason: 'not_active' });
  });

  it('SPEC §9.4 seed 7: a renewal starts the day after the old end at the last rent changed by the increase, rounded half up to 100.000 ₫, and links back', async () => {
    const cases = [
      { rent: 9_000_000, increaseBps: 500, renewed: 9_500_000 },
      { rent: 2_500_000, increaseBps: 600, renewed: 2_700_000 },
    ];
    for (const { rent, increaseBps, renewed } of cases) {
      // Ends after 02/11/2026, so cron.integration.test.ts, which runs next on the same stack, counts only the seed's ends.
      const lease = await activeLease({ start_date: '2025-12-01', end_date: '2026-11-30', rent_vnd: rent }, '30/09/2026');
      const result = await renewLease(lease.id, { increaseBps, endDate: '2027-11-30', paidThrough: '' });
      if (!result.ok) throw new Error(result.reason);
      const { data } = await client.from('leases').select('start_date, end_date, rent_vnd, status, renewal_of_lease_id').eq('id', result.value).single();
      expect(data, `${rent} + ${increaseBps} bps`).toEqual({ start_date: '2026-12-01', end_date: '2027-11-30', rent_vnd: renewed, status: 'active', renewal_of_lease_id: lease.id });
      expect(await renewLease(lease.id, { increaseBps, endDate: null, paidThrough: '' })).toEqual({ ok: false, reason: 'already_renewed' });
    }
  });

  it('a renewal reads its typed paid-through date as activation does, refusing one off the calendar or before the renewal starts', async () => {
    const lease = await activeLease({ start_date: '2025-12-01', end_date: '2026-11-30' }, '30/09/2026');
    const renew = (paidThrough: string) => renewLease(lease.id, { increaseBps: 0, endDate: '2027-11-30', paidThrough });
    expect(await renew('31/09/2026')).toEqual({ ok: false, reason: 'paid_through_invalid' });
    expect(await renew('30/11/2026')).toEqual({ ok: false, reason: 'paid_through_before_start' });
    const renewed = await renew('15/12/2026');
    if (!renewed.ok) throw new Error(renewed.reason);
    const { data } = await client.from('leases').select('start_date, paid_through_date').eq('id', renewed.value).single();
    expect(data).toEqual({ start_date: '2026-12-01', paid_through_date: '2026-12-15' });
  });

  it('LSE-3: after an amendment the drafts from its period bill the new terms and the earlier invoices keep theirs', async () => {
    const percentYearly = { kind: 'percent', value: 500, every_months: 12 } as const;
    const bill = (periodStart: string, periodEnd: string, rentVnd: number) => ({ periodStart, periodEnd, dueDate: periodStart, issueOn: periodStart, rentVnd });
    const cases: { values: Record<string, unknown>; paidThrough: string; amendment: { start: string; rentVnd: number; billingCycleMonths?: number }; bills: ReturnType<typeof bill>[] }[] = [
      {
        values: { start_date: '2026-08-01' },
        paidThrough: '2026-09-30',
        amendment: { start: '2026-11-01', rentVnd: 3_456_789 },
        bills: [bill('2026-10-01', '2026-10-31', 3_000_000), bill('2026-11-01', '2026-11-30', 3_456_789)],
      },
      {
        values: { start_date: '2025-11-10', period_anchor: 'lease_start', utilities_mode: 'metered_by_owner', escalation: percentYearly },
        paidThrough: '2026-09-09',
        amendment: { start: '2026-10-10', rentVnd: 4_000_000 },
        bills: [bill('2026-09-10', '2026-10-09', 3_000_000), bill('2026-10-10', '2026-11-09', 4_000_000), bill('2026-11-10', '2026-12-09', 4_200_000)],
      },
      {
        values: { start_date: '2026-08-10', billing_cycle_months: 3 },
        paidThrough: '2026-10-31',
        amendment: { start: '2026-11-01', rentVnd: 3_333_333, billingCycleMonths: 1 },
        bills: [bill('2026-11-01', '2026-11-30', 3_333_333)],
      },
      {
        values: { start_date: '2026-05-01', end_date: '2026-11-07', escalation: { kind: 'fixed', value: 250_000, every_months: 6 } },
        paidThrough: '2026-09-30',
        amendment: { start: '2026-11-01', rentVnd: 5_000_000 },
        bills: [bill('2026-10-01', '2026-10-31', 3_000_000), bill('2026-11-01', '2026-11-07', 1_166_667)],
      },
    ];
    for (const { values, paidThrough, amendment, bills } of cases) {
      const lease = await activeLease(values, formatDate(isoDate(paidThrough), 'vi'));
      const { error } = await client.rpc('amend_lease', {
        p_lease_id: lease.id,
        p_effective_period_start: amendment.start,
        p_rent_vnd: amendment.rentVnd,
        ...(amendment.billingCycleMonths === undefined ? {} : { p_billing_cycle_months: amendment.billingCycleMonths }),
      });
      if (error) throw error;
      const actual = (await billsOf(lease.id)).map(({ status: _status, ...written }) => written);
      expect(actual, JSON.stringify({ values, amendment })).toEqual(bills);
    }
  });
});

describe('the property list on the Clock date after lease changes', () => {
  it('counts only the lease in effect, at its amended rent, when a renewal is signed early', async () => {
    const lease = await activeLease({ end_date: '2026-12-31' }, '30/09/2026');
    expect(await amendLease(lease.id, { effectivePeriodStart: '2026-11-01', rentVnd: 3_300_000, reason: '' })).toEqual({ ok: true, value: undefined });
    const renewal = await renewLease(lease.id, { increaseBps: 500, endDate: '2027-12-31', paidThrough: '' });
    expect(renewal.ok).toBe(true);
    expect(await listed(lease.propertyId, '2026-10-07')).toEqual({ monthlyRentVnd: 3_000_000, leasedUnitCount: 1 });
    expect(await listed(lease.propertyId, '2026-11-15'), 'the amendment is in effect').toEqual({ monthlyRentVnd: 3_300_000, leasedUnitCount: 1 });
    expect(await listed(lease.propertyId, '2027-01-15'), '3.300.000 ₫ × 1,05 rounded half up').toEqual({ monthlyRentVnd: 3_500_000, leasedUnitCount: 1 });
  });

  it('keeps a lease terminated from a later date let and billed until that date', async () => {
    const lease = await activeLease({ end_date: '2027-07-31' }, '30/09/2026');
    expect(await terminateLease(lease.id, { terminatedOn: '2026-10-31', reason: 'Người thuê Demo chuyển đi' })).toEqual({ ok: true, value: { unbilled: 0 } });
    expect(await listed(lease.propertyId, '2026-10-07')).toEqual({ monthlyRentVnd: 3_000_000, leasedUnitCount: 1 });
    expect(await listed(lease.propertyId, '2026-10-31')).toEqual({ monthlyRentVnd: 3_000_000, leasedUnitCount: 1 });
    expect(await listed(lease.propertyId, '2026-11-01')).toEqual({ monthlyRentVnd: null, leasedUnitCount: 0 });
  });
});
