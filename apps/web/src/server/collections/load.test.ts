import { isoDate } from '@esta/core/date';
import { describe, expect, test, vi } from 'vitest';

const HOUSEHOLD_ID = '0943e55d-b0a6-5aef-839d-07c8693c520e';
const ROOM_5 = '00000000-0000-4000-8000-000000000005';
const ROOM_7 = '00000000-0000-4000-8000-000000000007';

const read = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/server/supabase/server', () => ({
  createSessionClient: async () => ({ from: () => query({ data: read.rows, error: null }), rpc: () => query({ data: read.rows, error: null }) }),
}));

/** A PostgREST builder that returns every row `invoice_balances` holds for the household, whatever the filters. */
function query(result: { data: unknown; error: null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gt: () => builder,
    order: () => builder,
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const { loadCollectionRows, loadOpenInvoices } = await import('./load');

let next = 0;
function invoice(leaseId: string, periodStart: string, dueDate: string, status: 'draft' | 'issued' | 'void', outstanding: number) {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-0000000a${String(next).padStart(4, '0')}`,
    lease_id: leaseId,
    period_start: periodStart,
    due_date: dueDate,
    status,
    outstanding_vnd: outstanding,
  };
}

const periodsOf = (invoices: readonly { periodStart: string }[] | undefined) => invoices?.map((open) => open.periodStart);

describe('loadOpenInvoices', () => {
  test('lists each lease’s invoices oldest due first, the order record_payment settles them in', async () => {
    read.rows = [
      invoice(ROOM_7, '2026-10-01', '2026-10-05', 'issued', 2_800_000),
      invoice(ROOM_5, '2026-09-01', '2026-09-05', 'issued', 2_500_000),
      invoice(ROOM_7, '2026-08-01', '2026-08-05', 'issued', 1_300_000),
      invoice(ROOM_7, '2026-09-01', '2026-09-05', 'issued', 2_800_000),
    ];
    const open = await loadOpenInvoices(HOUSEHOLD_ID);
    expect(periodsOf(open.get(ROOM_7))).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(periodsOf(open.get(ROOM_5))).toEqual(['2026-09-01']);
  });

  test('leaves out drafts, void invoices and issued invoices already paid', async () => {
    read.rows = [
      invoice(ROOM_7, '2026-08-01', '2026-08-05', 'issued', 0),
      invoice(ROOM_7, '2026-09-01', '2026-09-05', 'void', 2_800_000),
      invoice(ROOM_7, '2026-10-01', '2026-10-05', 'issued', 2_800_000),
      invoice(ROOM_7, '2026-11-01', '2026-11-05', 'draft', 2_800_000),
      invoice(ROOM_5, '2026-10-01', '2026-10-05', 'issued', 0),
    ];
    const open = await loadOpenInvoices(HOUSEHOLD_ID);
    expect(periodsOf(open.get(ROOM_7))).toEqual(['2026-10-01']);
    expect(open.has(ROOM_5)).toBe(false);
  });
});

describe('loadCollectionRows', () => {
  test('reads a bill whose meter credit outweighs its rent, so one such bill cannot take down Home and the board', async () => {
    read.rows = [
      {
        invoice_id: '00000000-0000-4000-8000-0000000b0001',
        property_id: '00000000-0000-4000-8000-0000000c0001',
        property_nickname: 'Dãy trọ Demo',
        unit_label: 'Phòng 1',
        unit_kind: 'room',
        lease_id: ROOM_5,
        tenant_name: 'Nguyễn Văn Demo',
        number: 'DIAN-202702-004',
        due_date: '2027-02-25',
        total_vnd: -91_650_000,
        allocated_vnd: 0,
        outstanding_vnd: 0,
        payment_status: 'overpaid',
      },
    ];
    const [row] = await loadCollectionRows(HOUSEHOLD_ID, isoDate('2027-02-01'));
    expect(row?.totalVnd).toBe(-91_650_000);
    expect(row?.outstandingVnd).toBe(0);
  });
});
