import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { describe, expect, it } from 'vitest';
import { leaseActivate } from './activation-op';
import { demoBills as bills, fakeDb, HOUSEHOLD, LEASE, OCTOBER, opContext as context, storedLease, viewLease, type Sent } from './test/fake-db';
import { NO_PENDING, withWrites } from './view';

const plannedLease = withWrites(NO_PENDING, [{ kind: 'create', table: 'leases', row: viewLease() }]);

function input(raw: unknown) {
  const parsed = leaseActivate.input.safeParse(raw);
  if (!parsed.success) throw new Error(`expected ${JSON.stringify(raw)} to parse`);
  return parsed.data;
}

const answer = (lease: unknown) => (request: Sent) => (request.table === 'leases' ? [lease] : request.table === 'invoices' ? [OCTOBER] : []);

describe('leaseActivate', () => {
  it('plans the activation of a lease planned earlier in the batch, and lays it over the lease for later items', async () => {
    const planned = await leaseActivate.plan(context(fakeDb().db, plannedLease), input({ lease_id: LEASE, paid_through: '2026-09-30' }));
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { lease_id: LEASE, paid_through: '2026-09-30' } } });
    expect(leaseActivate.writes?.(input({ lease_id: LEASE, paid_through: '2026-09-30' }))).toEqual([
      { kind: 'set', table: 'leases', id: LEASE, set: { status: 'active', paid_through_date: '2026-09-30' } },
    ]);
  });

  it('reads the planned lease as not found when nothing is pending, as apply does before the lease lands', async () => {
    expect(await leaseActivate.plan(context(fakeDb().db), input({ lease_id: LEASE, paid_through: null }))).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('reads an active lease with the same paid-through date as landed, with its invoices, and another date as already active', async () => {
    const { db } = fakeDb(answer(storedLease({ status: 'active', paid_through_date: '2026-09-30' })));
    expect(await leaseActivate.plan(context(db), input({ lease_id: LEASE, paid_through: '2026-09-30' }))).toEqual({
      ok: true,
      value: { kind: 'unchanged', current: { lease_id: LEASE, invoices: [OCTOBER] } },
    });
    expect(await leaseActivate.plan(context(db), input({ lease_id: LEASE, paid_through: '2026-10-31' }))).toEqual({ ok: false, reason: { kind: 'already_active' } });
  });

  it('refuses a draft activation would refuse, with every reason the form shows', async () => {
    const { db } = fakeDb(answer(storedLease({ rent_vnd: null, tenant_party_id: null })));
    expect(await leaseActivate.plan(context(db), input({ lease_id: LEASE, paid_through: '2026-02-28' }))).toEqual({
      ok: false,
      reason: { kind: 'cannot_activate', reasons: ['missing_tenant', 'missing_rent', 'paid_through_before_start'] },
    });
  });

  it("names what activate_lease raised from the op's own table", async () => {
    const raised = (message: string, code: string) => fakeDb(answer(storedLease()), (request) => (request.table === 'rpc/activate_lease' ? { code, message } : null)).db;
    const change = input({ lease_id: LEASE, paid_through: '2026-09-30' });
    expect(await leaseActivate.apply(context(raised('ESTA_LEASE_OVERLAP', '23P01')), change)).toEqual({ ok: false, reason: { kind: 'overlap' } });
    expect(await leaseActivate.apply(context(raised('ESTA_LEASE_ALREADY_ACTIVE', '55000')), change)).toEqual({ ok: false, reason: { kind: 'already_active' } });
    expect(await leaseActivate.apply(context(raised('ESTA_LEASE_TRANSITION', '23514')), change)).toEqual({ ok: false, reason: { kind: 'cannot_activate', reasons: ['not_draft'] } });
    expect(await leaseActivate.apply(context(raised('ESTA_LEASE_NOT_FOUND', 'P0002')), change)).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('previews the bills of the lease as the batch reads it, for this household, with display strings', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'rpc/preview_lease_bills' ? bills : []));
    const preview = await leaseActivate.preview?.(context(db, plannedLease), input({ lease_id: LEASE, paid_through: '2026-09-30' }));
    expect(preview).toEqual({
      paid_through_display: '30/09/2026',
      bills: [
        { ...bills[0], rent_display: formatVnd(vnd(9_000_000), 'vi') },
        { ...bills[1], rent_display: formatVnd(vnd(9_000_000), 'vi') },
      ],
    });
    expect(sent.find((request) => request.table === 'rpc/preview_lease_bills')?.body).toMatchObject({
      p_household_id: HOUSEHOLD,
      p_paid_through: '2026-09-30',
      p_lease: { id: LEASE, start_date: '2026-03-01', rent_vnd: 9_000_000, billing_cycle_months: 1 },
    });
  });
});
