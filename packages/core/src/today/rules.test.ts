import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '../allocation/status';
import { isoDate, type IsoDate } from '../date/iso-date';
import { LEASE_ENDING_DAYS, TODAY_LIMIT, TODAY_RULES, todayItems, type TodayBill, type TodayItem, type TodayLease, type TodaySnapshot } from './rules';

const DI_AN = 'Dãy trọ Dĩ An';
const WHOLE = 'Toàn bộ';

const bill = (propertyName: string, unitLabel: string, dueDate: string, paymentStatus: PaymentStatus): TodayBill => ({
  invoiceId: `${propertyName}:${unitLabel}:${dueDate}`,
  propertyName,
  unitLabel,
  dueDate: isoDate(dueDate),
  paymentStatus,
});

const lease = (propertyName: string, unitLabel: string, endDate: string | null, overrides: Partial<TodayLease> = {}): TodayLease => ({
  leaseId: `${propertyName}:${unitLabel}`,
  propertyName,
  unitLabel,
  status: 'active',
  endDate: endDate === null ? null : isoDate(endDate),
  renewed: false,
  ...overrides,
});

/** SPEC §9.3 on 2026-10-07: the October board's rows, every seeded lease, and the papers that carry an expiry. */
const FULL_SEED: TodaySnapshot = {
  bills: [
    bill(DI_AN, 'Phòng 5', '2026-09-25', 'unpaid'),
    bill('Căn hộ Thủ Đức', WHOLE, '2026-10-01', 'paid'),
    bill('Nhà phố Q7', WHOLE, '2026-10-01', 'paid'),
    ...[1, 2, 3, 4, 5, 6].map((n) => bill(DI_AN, `Phòng ${n}`, '2026-10-25', 'unpaid')),
  ],
  leases: [
    lease('Căn hộ Thủ Đức', WHOLE, '2026-11-01'),
    ...[1, 2, 3, 4, 5, 6].map((n) => lease(DI_AN, `Phòng ${n}`, '2027-06-24')),
    lease(DI_AN, 'Phòng 7', '2026-09-15', { status: 'ended' }),
    lease('Kho Biên Hòa', WHOLE, '2026-07-29', { status: 'ended' }),
    lease('Mặt bằng Quận 1', 'Mặt bằng tầng trệt', '2029-02-28'),
    lease('Nhà phố Q7', WHOLE, '2027-12-31'),
  ],
  documents: [
    { documentId: 'q7-insurance', title: 'Bảo hiểm cháy nổ Nhà phố Q7', expiresOn: isoDate('2026-10-30') },
    { documentId: 'thu-duc-lease', title: 'Hợp đồng thuê Căn hộ Thủ Đức', expiresOn: null },
  ],
  reviews: [],
};

/** Each item as Mẹ reads it: the rule, the place or title, and the date it is about. */
function read(items: readonly TodayItem[]) {
  return items.map((item) => {
    switch (item.rule) {
      case 'overdue_invoice':
        return [item.rule, `${item.bill.unitLabel}, ${item.bill.propertyName}`, item.date, item.days];
      case 'due_today':
        return [item.rule, `${item.bill.unitLabel}, ${item.bill.propertyName}`, item.date];
      case 'lease_ending':
        return [item.rule, item.lease.propertyName, item.date, item.days];
      case 'document_expiring':
        return [item.rule, item.document.title, item.date, item.days];
      case 'extraction_waiting':
        return [item.rule, item.review.title, item.date];
    }
  });
}

const on = (snapshot: TodaySnapshot, day: string) => todayItems(snapshot, isoDate(day));

describe('TODAY_RULES', () => {
  it('gives every rule one id, one priority and one action', () => {
    expect(TODAY_RULES.map(({ id, priority, action }) => [id, priority, action])).toEqual([
      ['overdue_invoice', 1, 'recordPayment'],
      ['lease_ending', 2, 'renew'],
      ['document_expiring', 3, 'openDocument'],
      ['extraction_waiting', 4, 'review'],
      ['due_today', 5, 'recordPayment'],
    ]);
    expect(new Set(TODAY_RULES.map(({ priority }) => priority)).size).toBe(TODAY_RULES.length);
  });
});

describe('todayItems', () => {
  it('the full seed on 2026-10-07: Phòng 5 to record, the Thủ Đức lease to renew and the Q7 insurance to read', () => {
    const today = on(FULL_SEED, '2026-10-07');
    expect(read(today.items)).toEqual([
      ['overdue_invoice', `Phòng 5, ${DI_AN}`, '2026-09-25', 12],
      ['lease_ending', 'Căn hộ Thủ Đức', '2026-11-01', 25],
      ['document_expiring', 'Bảo hiểm cháy nổ Nhà phố Q7', '2026-10-30', 23],
    ]);
    expect(today.total).toBe(3);
    expect(today.items.map(({ action }) => action)).toEqual(['recordPayment', 'renew', 'openDocument']);
  });

  it('on 2026-10-25 nine candidates yield seven, and the two the cap hides are bills due today', () => {
    const today = on(FULL_SEED, '2026-10-25');
    expect(today.total).toBe(9);
    expect(today.items).toHaveLength(TODAY_LIMIT);
    expect(read(today.items)).toEqual([
      ['overdue_invoice', `Phòng 5, ${DI_AN}`, '2026-09-25', 30],
      ['lease_ending', 'Căn hộ Thủ Đức', '2026-11-01', 7],
      ['document_expiring', 'Bảo hiểm cháy nổ Nhà phố Q7', '2026-10-30', 5],
      ...[1, 2, 3, 4].map((n) => ['due_today', `Phòng ${n}, ${DI_AN}`, '2026-10-25']),
    ]);
  });

  it('leaves out a lease another lease renews', () => {
    const renewed: TodaySnapshot = { ...FULL_SEED, leases: [lease('Căn hộ Thủ Đức', WHOLE, '2026-11-01', { renewed: true })] };
    expect(read(on(renewed, '2026-10-07').items).map(([rule]) => rule)).toEqual(['overdue_invoice', 'document_expiring']);
  });

  it('an empty snapshot gives nothing to do', () => {
    expect(on({ bills: [], leases: [], documents: [], reviews: [] }, '2026-10-07')).toEqual({ items: [], total: 0 });
  });

  it('a lease counts from 30 days before its last day through that day, and only while it is active', () => {
    const ending = (endDate: string | null, overrides: Partial<TodayLease> = {}) =>
      on({ bills: [], leases: [lease('Căn hộ Thủ Đức', WHOLE, endDate, overrides)], documents: [], reviews: [] }, '2026-10-07').total;
    expect(LEASE_ENDING_DAYS).toBe(30);
    expect(ending('2026-11-06')).toBe(1);
    expect(ending('2026-11-07')).toBe(0);
    expect(ending('2026-10-07')).toBe(1);
    expect(ending('2026-10-06'), 'past its last day the nightly job ends it; nothing is left to renew from Home').toBe(0);
    expect(ending(null), 'an open-ended lease has no end to renew').toBe(0);
    expect(ending('2026-10-20', { status: 'terminated' })).toBe(0);
    expect(ending('2026-10-20', { status: 'draft' })).toBe(0);
  });

  it('a document counts from 30 days out through its expiry day, and not once it has expired', () => {
    const expiring = (expiresOn: IsoDate | null) => on({ bills: [], leases: [], documents: [{ documentId: 'd', title: 'Giấy phép', expiresOn }], reviews: [] }, '2026-10-07');
    expect(read(expiring(isoDate('2026-10-07')).items)).toEqual([['document_expiring', 'Giấy phép', '2026-10-07', 0]]);
    expect(expiring(isoDate('2026-11-06')).total).toBe(1);
    expect(expiring(isoDate('2026-11-07')).total).toBe(0);
    expect(expiring(isoDate('2026-10-06')).total).toBe(0);
    expect(expiring(null).total).toBe(0);
  });

  it('reads a bill as the board does: overdue by days, due on its day, quiet before, gone once paid', () => {
    const bills = [
      bill(DI_AN, 'Phòng 2', '2026-10-01', 'partial'),
      bill(DI_AN, 'Phòng 3', '2026-10-01', 'overpaid'),
      bill(DI_AN, 'Phòng 4', '2026-10-07', 'unpaid'),
      bill(DI_AN, 'Phòng 6', '2026-10-08', 'unpaid'),
    ];
    expect(read(on({ bills, leases: [], documents: [], reviews: [] }, '2026-10-07').items)).toEqual([
      ['overdue_invoice', `Phòng 2, ${DI_AN}`, '2026-10-01', 6],
      ['due_today', `Phòng 4, ${DI_AN}`, '2026-10-07'],
    ]);
  });

  it('lists a reading waiting for review under the leases and papers, by title', () => {
    const reviews = [
      { documentId: 'b', title: 'Sổ hồng Bảo Lộc' },
      { documentId: 'a', title: 'Hóa đơn điện tháng 9' },
    ];
    expect(read(on({ ...FULL_SEED, reviews }, '2026-10-07').items)).toEqual([
      ['overdue_invoice', `Phòng 5, ${DI_AN}`, '2026-09-25', 12],
      ['lease_ending', 'Căn hộ Thủ Đức', '2026-11-01', 25],
      ['document_expiring', 'Bảo hiểm cháy nổ Nhà phố Q7', '2026-10-30', 23],
      ['extraction_waiting', 'Hóa đơn điện tháng 9', '2026-10-07'],
      ['extraction_waiting', 'Sổ hồng Bảo Lộc', '2026-10-07'],
    ]);
  });

  it('puts the longest overdue first and orders rooms by number within a day', () => {
    const bills = [
      bill(DI_AN, 'Phòng 10', '2026-10-25', 'unpaid'),
      bill(DI_AN, 'Phòng 9', '2026-10-25', 'unpaid'),
      bill(DI_AN, 'Phòng 4', '2026-09-25', 'unpaid'),
      bill(DI_AN, 'Phòng 8', '2026-08-25', 'unpaid'),
    ];
    expect(read(on({ bills, leases: [], documents: [], reviews: [] }, '2026-10-25').items).map(([, place]) => place)).toEqual([
      `Phòng 8, ${DI_AN}`,
      `Phòng 4, ${DI_AN}`,
      `Phòng 9, ${DI_AN}`,
      `Phòng 10, ${DI_AN}`,
    ]);
  });
});
