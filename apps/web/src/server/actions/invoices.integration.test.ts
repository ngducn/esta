import { isoDate } from '@esta/core/date';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationLane } from '@/test/lanes';
import { memberClient } from '@/test/member-client';
import { service } from '@/test/stack';
import { twoAtOnce } from '@/test/two-at-once';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// 2026-10-07. A void cannot be undone and the cron test reads every seeded lease, so this file bills its own Demo
// property in its lane: Phòng A's October bill went out by mistake, Phòng B paid October and holds November's draft.
const { household: HOUSEHOLD, ryan } = integrationLane(import.meta.url);
const { client, signIn } = memberClient(ryan, HOUSEHOLD);

const { issueInvoice, voidInvoice } = await import('./invoices');
const { addReceivingAccount, editReceivingAccount, removeReceivingAccount, setDefaultReceivingAccount } = await import('./receiving-accounts');
const { terminateLease } = await import('./leases');
const { loadPropertyLeases } = await import('@/server/leases/load');

const run = Math.floor(Math.random() * 1e6)
  .toString()
  .padStart(6, '0');
const ids = { property: crypto.randomUUID(), tenant: crypto.randomUUID(), unitA: crypto.randomUUID(), unitB: crypto.randomUUID(), leaseA: crypto.randomUUID(), leaseB: crypto.randomUUID() };
const bills = { october: '', paid: '', november: '' };

const post = (table: string, rows: unknown) => service(`/rest/v1/${table}`, { method: 'POST', body: JSON.stringify(rows) });

/** The rental as Mẹ would have entered it: two draft leases started on the lease screen, and Phòng B's October paid in cash. */
async function seedDemoRental() {
  await post('properties', { id: ids.property, household_id: HOUSEHOLD, nickname: `Demo P3-20 ${run}`, code: `IT${run}`, kind: 'rooming_house', use_mode: 'rental' });
  await post('units', [
    { id: ids.unitA, household_id: HOUSEHOLD, property_id: ids.property, label: 'Phòng A', kind: 'room' },
    { id: ids.unitB, household_id: HOUSEHOLD, property_id: ids.property, label: 'Phòng B', kind: 'room' },
  ]);
  await post('parties', { id: ids.tenant, household_id: HOUSEHOLD, kind: 'individual', full_name: 'Lê Văn Demo', tags: ['tenant'] });
  const lease = { household_id: HOUSEHOLD, property_id: ids.property, tenant_party_id: ids.tenant, start_date: '2026-09-01', end_date: '2027-08-31', rent_vnd: 3_000_000 };
  const terms = { billing_cycle_months: 1, period_anchor: 'calendar_month', utilities_mode: 'tenant_direct', due_offset_days: 0 };
  await post('leases', [
    { id: ids.leaseA, unit_id: ids.unitA, ...lease, ...terms },
    { id: ids.leaseB, unit_id: ids.unitB, ...lease, ...terms },
  ]);
  for (const [leaseId, paidThrough] of [[ids.leaseA, null], [ids.leaseB, '2026-09-30']] as const) {
    const { error } = await client.rpc('activate_lease', { p_lease_id: leaseId, ...(paidThrough === null ? {} : { p_paid_through: paidThrough }) });
    if (error) throw error;
  }
  const { data, error } = await client.from('invoices').select('id, lease_id, period_start, status').in('lease_id', [ids.leaseA, ids.leaseB]).order('period_start');
  if (error) throw error;
  const find = (leaseId: string, start: string) => data.find((row) => row.lease_id === leaseId && row.period_start === start)?.id ?? '';
  Object.assign(bills, { october: find(ids.leaseA, '2026-10-01'), paid: find(ids.leaseB, '2026-10-01'), november: find(ids.leaseB, '2026-11-01') });
  const paid = await client.rpc('record_payment', {
    p_invoice_id: bills.paid,
    p_owed_vnd: 3_000_000,
    p_amount_vnd: 3_000_000,
    p_method: 'cash',
    p_received_on: '2026-10-02',
    p_idempotency_key: crypto.randomUUID(),
  });
  if (paid.error) throw paid.error;
}

async function bill(id: string) {
  const { data, error } = await client.from('invoices').select('status, issue_on, issued_at, voided_reason').eq('id', id).single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await signIn();
  await seedDemoRental();
}, 30_000);

describe('invoice actions against local Supabase (LSE-5)', () => {
  it("issues Phòng B's November draft on the database clock's date, and a second tap changes nothing", async () => {
    expect(await bill(bills.november)).toMatchObject({ status: 'draft', issue_on: '2026-11-01', issued_at: null });
    expect(await issueInvoice({ invoice_id: bills.november })).toEqual({ ok: true, value: undefined });
    const issued = await bill(bills.november);
    expect(issued).toMatchObject({ status: 'issued', issue_on: '2026-10-07' });
    expect(await issueInvoice({ invoice_id: bills.november })).toEqual({ ok: true, value: undefined });
    expect(await bill(bills.november)).toEqual(issued);
  });

  it("voids Phòng A's October bill, which blocks ending the lease on 30/09, only with a reason", async () => {
    expect(await terminateLease(ids.leaseA, { terminatedOn: '2026-09-30', reason: 'Demo' })).toEqual({ ok: false, reason: 'before_issued' });
    expect(await voidInvoice({ invoice_id: bills.october, reason: '   ' })).toEqual({ ok: false, reason: 'reasonRequired' });
    expect((await bill(bills.october)).status).toBe('issued');
    expect(await voidInvoice({ invoice_id: bills.october, reason: ' Demo: người thuê đã chuyển đi 30/09 ' })).toEqual({ ok: true, value: undefined });
    expect(await voidInvoice({ invoice_id: bills.october, reason: 'Lần hai' })).toEqual({ ok: true, value: undefined });
    expect(await bill(bills.october)).toMatchObject({ status: 'void', voided_reason: 'Demo: người thuê đã chuyển đi 30/09' });
  });

  it('refuses to void a bill a payment settled ([app rule])', async () => {
    expect(await voidInvoice({ invoice_id: bills.paid, reason: 'Demo' })).toEqual({ ok: false, reason: 'hasPayments' });
    expect((await bill(bills.paid)).status).toBe('issued');
  });

  it('never bills the voided October again, and the lease it blocked now ends on 30/09', async () => {
    await service('/rest/v1/rpc/run_invoicing', {
      method: 'POST',
      headers: { 'x-esta-actor': 'system:cron' },
      body: JSON.stringify({ p_household_id: HOUSEHOLD, p_as_of: '2026-10-07', p_issued_at: '2026-10-07T00:30:00+07:00' }),
    });
    expect(await terminateLease(ids.leaseA, { terminatedOn: '2026-09-30', reason: 'Demo: người thuê chuyển đi' })).toEqual({ ok: true, value: { unbilled: 0 } });
    const { data, error } = await client.from('invoices').select('period_start, status').eq('lease_id', ids.leaseA).gte('period_start', '2026-10-01');
    if (error) throw error;
    expect(data, 'October stays void and the November draft goes with the termination').toEqual([{ period_start: '2026-10-01', status: 'void' }]);
  });
});

describe('receiving account actions against local Supabase (PLT-1)', () => {
  const account = { bank_bin: '970436', account_no: `0071 000 ${run}`, account_name: 'Trần Minh Demo' };
  const added = crypto.randomUUID();
  const spare = crypto.randomUUID();
  let seeded = '';

  async function accounts() {
    const { data, error } = await client.from('bank_accounts').select('id, account_no, account_name, is_default').eq('household_id', HOUSEHOLD).order('created_at');
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    seeded = (await accounts()).find((row) => row.is_default)?.id ?? '';
    expect(seeded, 'the lane is seeded with a default account').not.toBe('');
  });

  afterAll(async () => {
    await service(`/rest/v1/payments?household_id=eq.${HOUSEHOLD}&bank_account_id=eq.${added}`, { method: 'DELETE' });
    await setDefaultReceivingAccount({ id: seeded });
    for (const id of [added, spare]) await removeReceivingAccount({ id });
  });

  it('adds a second account as Mẹ types it, which does not replace the default', async () => {
    expect(await addReceivingAccount({ id: added, ...account })).toEqual({ ok: true, value: undefined });
    expect((await accounts()).find((row) => row.id === added)).toEqual({ id: added, account_no: `0071000${run}`, account_name: 'TRAN MINH DEMO', is_default: false });
  });

  it('refuses the same account twice, a bank NAPAS does not list and a name with nothing printable', async () => {
    expect(await addReceivingAccount({ id: crypto.randomUUID(), ...account })).toEqual({ ok: false, reason: 'duplicate' });
    expect(await addReceivingAccount({ id: crypto.randomUUID(), ...account, bank_bin: '999999' })).toEqual({ ok: false, reason: 'bank' });
    expect(await addReceivingAccount({ id: crypto.randomUUID(), ...account, account_name: '  ' })).toEqual({ ok: false, reason: 'accountName' });
  });

  it('edits the name as the add sheet reads it, and refuses a number the default already has', async () => {
    expect(await editReceivingAccount({ id: added, ...account, account_name: 'Nguyễn Thị  Demo' })).toEqual({ ok: true, value: undefined });
    expect((await accounts()).find((row) => row.id === added)?.account_name).toBe('NGUYEN THI DEMO');
    const [{ account_no: taken = '' } = {}] = (await accounts()).filter((row) => row.id === seeded);
    expect(await editReceivingAccount({ id: added, ...account, account_no: taken })).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('moves the default so exactly one account is the default, and a second tap changes nothing', async () => {
    expect(await setDefaultReceivingAccount({ id: added })).toEqual({ ok: true, value: undefined });
    expect(await setDefaultReceivingAccount({ id: added })).toEqual({ ok: true, value: undefined });
    expect((await accounts()).filter((row) => row.is_default).map((row) => row.id)).toEqual([added]);
  });

  it('refuses to remove the default and an account a payment landed in, keeps the number of that account but corrects its holder, and removes an unused one once', async () => {
    expect(await removeReceivingAccount({ id: added })).toEqual({ ok: false, reason: 'isDefault' });
    expect(await setDefaultReceivingAccount({ id: seeded })).toEqual({ ok: true, value: undefined });
    await post('payments', { household_id: HOUSEHOLD, amount_vnd: 3_000_000, received_on: '2026-10-05', method: 'bank_transfer', bank_account_id: added });
    expect(await removeReceivingAccount({ id: added })).toEqual({ ok: false, reason: 'inUse' });
    expect(await editReceivingAccount({ id: added, ...account, account_no: `0073 000 ${run}` })).toEqual({ ok: false, reason: 'numberLocked' });
    expect(await editReceivingAccount({ id: added, ...account, account_name: 'Trần Minh Demo' })).toEqual({ ok: true, value: undefined });
    expect(await addReceivingAccount({ id: spare, ...account, account_no: `0072 000 ${run}` })).toEqual({ ok: true, value: undefined });
    expect(await removeReceivingAccount({ id: spare })).toEqual({ ok: true, value: undefined });
    expect(await removeReceivingAccount({ id: spare })).toEqual({ ok: true, value: undefined });
    expect((await accounts()).map((row) => row.id).toSorted()).toEqual([added, seeded].toSorted());
  });
});

const LONG_AGO = '1926-01-01';
/** A draft lease on its own room of the Demo property, started on a date of the test's choosing. */
async function draftLease(start: string, rent: number) {
  const unit = crypto.randomUUID();
  const lease = crypto.randomUUID();
  await post('units', { id: unit, household_id: HOUSEHOLD, property_id: ids.property, label: `Phòng ${lease.slice(0, 4)}`, kind: 'room' });
  await post('leases', {
    id: lease, household_id: HOUSEHOLD, property_id: ids.property, unit_id: unit, tenant_party_id: ids.tenant, start_date: start, rent_vnd: rent,
    billing_cycle_months: 1, period_anchor: 'calendar_month', utilities_mode: 'tenant_direct', due_offset_days: 0,
  });
  return { unit, lease };
}

describe('the database keeps a room to one lease (#198)', () => {
  it('lets one of two leases that start together on a room win, and tells the other the room is taken', async () => {
    const first = await draftLease('2026-10-01', 3_000_000);
    const second = crypto.randomUUID();
    await post('leases', {
      id: second, household_id: HOUSEHOLD, property_id: ids.property, unit_id: first.unit, tenant_party_id: ids.tenant, start_date: '2026-10-01', rent_vnd: 3_100_000,
      billing_cycle_months: 1, period_anchor: 'calendar_month', utilities_mode: 'tenant_direct', due_offset_days: 0,
    });
    const both = [first.lease, second];
    let next = 0;
    const outcomes = await twoAtOnce(async () => (await client.rpc('activate_lease', { p_lease_id: both[next++] ?? '' })).error?.message ?? 'activated');
    expect(outcomes.map((outcome) => (outcome.status === 'fulfilled' ? outcome.value : 'threw')).sort()).toEqual(['ESTA_LEASE_OVERLAP', 'activated']);
    const { data } = await client.from('leases').select('status').in('id', both);
    expect(data?.map((row) => row.status).sort()).toEqual(['active', 'draft']);
  }, 30_000);

  it('refuses a second active lease on a held room, even from the service role', async () => {
    const held = await draftLease('2026-10-01', 3_000_000);
    const activated = await client.rpc('activate_lease', { p_lease_id: held.lease });
    expect(activated.error).toBeNull();
    await expect(
      post('leases', {
        household_id: HOUSEHOLD, property_id: ids.property, unit_id: held.unit, tenant_party_id: ids.tenant, start_date: '2026-11-01', rent_vnd: 3_000_000, status: 'active',
      }),
    ).rejects.toThrow(/23P01/);
  });
});

describe('the rental tab with more than one page of bills (#226)', () => {
  it('shows the newest unpaid bills of a lease that holds more than 1,000 older ones', async () => {
    const { lease } = await draftLease(LONG_AGO, 3_000_000);
    const activated = await client.rpc('activate_lease', { p_lease_id: lease });
    expect(activated.error).toBeNull();
    // Every month from January 1926 to September 2026, so no draft is left for the nightly cron test that runs after this file.
    const nights = Array.from({ length: 1209 }, (_, n) => `${1926 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`);
    for (let from = 0; from < nights.length; from += 50) {
      await Promise.all(
        nights.slice(from, from + 50).map((night) =>
          service(`/rest/v1/rpc/run_invoicing`, { method: 'POST', body: JSON.stringify({ p_household_id: HOUSEHOLD, p_as_of: night, p_issued_at: `${night}T00:30:00+07:00` }) }),
        ),
      );
    }
    const raw = await client.from('invoice_balances').select('id').eq('lease_id', lease).order('period_start');
    expect(raw.data, 'PostgREST cuts a plain read at 1,000 rows, which is what the tab used to show').toHaveLength(1000);
    const { count } = await client.from('invoices').select('id', { count: 'exact', head: true }).eq('lease_id', lease);
    expect(count).toBeGreaterThan(1200);

    const { invoices } = await loadPropertyLeases(ids.property, isoDate('2026-10-07'));
    expect(invoices.filter((invoice) => invoice.leaseId === lease)).toHaveLength(count ?? -1);
    expect(invoices.filter((invoice) => invoice.leaseId === lease && invoice.periodStart >= '2026-10-01').map((invoice) => [invoice.periodStart, invoice.status])).toEqual([
      ['2026-10-01', 'issued'],
      ['2026-11-01', 'draft'],
    ]);
  }, 180_000);
});
