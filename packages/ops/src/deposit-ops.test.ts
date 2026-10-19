import { formatVnd } from '@esta/core/format';
import { MAX_AMOUNT_VND, vnd } from '@esta/core/money';
import { describe, expect, it } from 'vitest';
import { depositRecord } from './deposit-ops';
import { fakeDb, LEASE, opContext as context, storedLease, viewLease, type Sent } from './test/fake-db';
import { NO_PENDING, withWrites } from './view';

const KEY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0008';
const ENTRY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0009';
const received = { id: KEY, lease_id: LEASE, kind: 'received', amount_vnd: 18_000_000, on_date: '2026-03-01', note: null };

function input(raw: unknown) {
  const parsed = depositRecord.input.safeParse(raw);
  if (!parsed.success) throw new Error(`expected ${JSON.stringify(raw)} to parse`);
  return parsed.data;
}

const leaseIs = (status: string) => (request: Sent) => (request.table === 'leases' ? [storedLease({ status })] : []);

describe('depositRecord', () => {
  it('takes a receipt, a deduction or a refund, and leaves applying the deposit to a bill to the screen', () => {
    expect(depositRecord.input.safeParse(received).success).toBe(true);
    expect(depositRecord.input.safeParse({ ...received, kind: 'applied' }).success).toBe(false);
    expect(depositRecord.input.safeParse({ ...received, amount_vnd: MAX_AMOUNT_VND }).success).toBe(true);
    for (const amount of [0, MAX_AMOUNT_VND + 1]) expect(depositRecord.input.safeParse({ ...received, amount_vnd: amount }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['amount_vnd']);
  });

  it('refuses a deposit on a draft, and plans one on a lease activated earlier in the batch', async () => {
    expect(await depositRecord.plan(context(fakeDb(leaseIs('draft')).db), input(received))).toEqual({ ok: false, reason: { kind: 'not_active' } });
    const activated = withWrites(NO_PENDING, [
      { kind: 'create', table: 'leases', row: viewLease() },
      { kind: 'set', table: 'leases', id: LEASE, set: { status: 'active', paid_through_date: null } },
    ]);
    expect(await depositRecord.plan(context(fakeDb().db, activated), input(received))).toEqual({ ok: true, value: { kind: 'change', change: received } });
  });

  it('plans a refund on a terminated lease, as record_deposit_entry takes one', async () => {
    const refund = input({ ...received, kind: 'refunded' });
    expect(await depositRecord.plan(context(fakeDb(leaseIs('terminated')).db), refund)).toEqual({ ok: true, value: { kind: 'change', change: refund } });
  });

  it('plans unchanged for a key already written, before it reads the lease', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'deposit_entries' ? [{ id: ENTRY }] : []));
    expect(await depositRecord.plan(context(db), input(received))).toEqual({ ok: true, value: { kind: 'unchanged', current: { entry_id: ENTRY } } });
    expect(sent.map((request) => request.table)).toEqual(['deposit_entries']);
  });

  it('reads the lease as not found when nothing is pending and the database has none', async () => {
    expect(await depositRecord.plan(context(fakeDb().db), input(received))).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it("names what record_deposit_entry raised from the op's own table", async () => {
    const raised = (message: string) => context(fakeDb(() => [], (request) => (request.table === 'rpc/record_deposit_entry' ? { code: '22023', message } : null)).db);
    expect(await depositRecord.apply(raised('ESTA_DEPOSIT_EXCEEDS_HELD'), input(received))).toEqual({ ok: false, reason: { kind: 'exceeds_held' } });
    expect(await depositRecord.apply(raised('ESTA_DEPOSIT_DATE_AFTER_TODAY'), input(received))).toEqual({ ok: false, reason: { kind: 'date_after_today' } });
    expect(await depositRecord.apply(raised('ESTA_DEPOSIT_NOTE_REQUIRED'), input(received))).toEqual({ ok: false, reason: { kind: 'note_required' } });
    expect(await depositRecord.apply(raised('ESTA_LEASE_NOT_ACTIVE'), input(received))).toEqual({ ok: false, reason: { kind: 'not_active' } });
    expect(await depositRecord.apply(raised('ESTA_DEPOSIT_AMOUNT'), input(received))).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'amount_vnd', code: 'too_small' }] } });
  });

  it('previews the amount, the day and what the lease holds after it', async () => {
    const held = fakeDb((request) => (request.table === 'lease_deposits' ? [{ held_vnd: 18_000_000 }] : []));
    expect(await depositRecord.preview?.(context(held.db), input({ ...received, kind: 'deduction', amount_vnd: 2_000_000, on_date: '2026-10-01', note: 'Demo: sửa cửa' }))).toEqual({
      amount_display: formatVnd(vnd(2_000_000), 'vi'),
      on_date_display: '01/10/2026',
      held_after_display: formatVnd(vnd(16_000_000), 'vi'),
    });
    expect(await depositRecord.preview?.(context(fakeDb().db), input(received))).toMatchObject({ held_after_display: formatVnd(vnd(18_000_000), 'vi') });
  });
});
