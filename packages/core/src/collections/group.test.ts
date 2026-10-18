import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '../allocation/status';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { groupCollections, worstCollectionState, type CollectionCandidate, type CollectionGroup } from './group';

const DI_AN = 'Dãy trọ Dĩ An';

function row(propertyName: string, unitLabel: string, dueDate: string, totalVnd: number, allocatedVnd: number, paymentStatus: PaymentStatus): CollectionCandidate {
  return {
    invoiceId: `${propertyName}:${unitLabel}:${dueDate}`,
    propertyId: propertyName,
    propertyName,
    unitLabel,
    dueDate: isoDate(dueDate),
    totalVnd: vnd(totalVnd),
    allocatedVnd: vnd(allocatedVnd),
    outstandingVnd: vnd(Math.max(totalVnd - allocatedVnd, 0)),
    paymentStatus,
  };
}

const october25 = [1, 2, 3, 4, 5, 6].map((n) => row(DI_AN, `Phòng ${n}`, '2026-10-25', n >= 5 ? 2_800_000 : 2_500_000, 0, 'unpaid'));

/** `collection_candidates('2026-10-01')` on the full seed. */
const OCTOBER = [
  ...october25,
  row(DI_AN, 'Phòng 5', '2026-09-25', 2_800_000, 0, 'unpaid'),
  row('Nhà phố Q7', 'Toàn bộ', '2026-10-01', 45_000_000, 45_000_000, 'paid'),
  row('Căn hộ Thủ Đức', 'Toàn bộ', '2026-10-01', 9_000_000, 9_000_000, 'paid'),
];

/** `collection_candidates('2026-09-01')`: Phòng 2 paid in two transfers. */
const SEPTEMBER = [
  ...[1, 2, 3, 4, 6].map((n) => row(DI_AN, `Phòng ${n}`, '2026-09-25', n === 6 ? 2_800_000 : 2_500_000, n === 6 ? 2_800_000 : 2_500_000, 'paid')),
  row(DI_AN, 'Phòng 5', '2026-09-25', 2_800_000, 0, 'unpaid'),
  row('Căn hộ Thủ Đức', 'Toàn bộ', '2026-09-01', 9_000_000, 9_000_000, 'paid'),
];

const summary = (groups: readonly CollectionGroup<CollectionCandidate>[]) =>
  groups.map(({ key, items, totalVnd }) => ({
    key,
    totalVnd,
    items: items.map(({ row: { unitLabel, dueDate }, state, amountVnd, carriedFrom }) => ({ unitLabel, dueDate, state, amountVnd, carriedFrom })),
  }));

describe('groupCollections', () => {
  it('the full-seed October board on 2026-10-07: Phòng 5 overdue 12 days from September, six Dĩ An rooms due 25/10 (LSE-10)', () => {
    expect(summary(groupCollections(OCTOBER, isoDate('2026-10-01'), isoDate('2026-10-07')))).toEqual([
      {
        key: 'overdue',
        totalVnd: 2_800_000,
        items: [{ unitLabel: 'Phòng 5', dueDate: '2026-09-25', state: { group: 'overdue', days: 12 }, amountVnd: 2_800_000, carriedFrom: '2026-09-01' }],
      },
      { key: 'due', totalVnd: 0, items: [] },
      {
        key: 'notDue',
        totalVnd: 15_600_000,
        items: october25.map(({ unitLabel, outstandingVnd }) => ({
          unitLabel,
          dueDate: '2026-10-25',
          state: { group: 'notDue' },
          amountVnd: outstandingVnd,
          carriedFrom: null,
        })),
      },
      {
        key: 'paid',
        totalVnd: 54_000_000,
        items: [
          { unitLabel: 'Toàn bộ', dueDate: '2026-10-01', state: { group: 'paid' }, amountVnd: 9_000_000, carriedFrom: null },
          { unitLabel: 'Toàn bộ', dueDate: '2026-10-01', state: { group: 'paid' }, amountVnd: 45_000_000, carriedFrom: null },
        ],
      },
    ]);
  });

  it('the September board: Phòng 5 overdue with no carry marker and the other five Dĩ An rooms paid', () => {
    const [overdue, due, notDue, paid] = groupCollections(SEPTEMBER, isoDate('2026-09-01'), isoDate('2026-10-07'));
    expect(overdue?.items.map(({ row: { unitLabel }, state, carriedFrom }) => ({ unitLabel, state, carriedFrom }))).toEqual([
      { unitLabel: 'Phòng 5', state: { group: 'overdue', days: 12 }, carriedFrom: null },
    ]);
    expect(due?.items).toEqual([]);
    expect(notDue?.items).toEqual([]);
    expect(paid?.items.map(({ row }) => `${row.propertyName} ${row.unitLabel}`)).toEqual([
      'Căn hộ Thủ Đức Toàn bộ',
      ...[1, 2, 3, 4, 6].map((n) => `${DI_AN} Phòng ${n}`),
    ]);
    expect(paid?.totalVnd).toBe(9_000_000 + 4 * 2_500_000 + 2_800_000);
  });

  it('puts an unpaid row due on the as-of date under due, and the same row paid under paid', () => {
    const today = row(DI_AN, 'Phòng 1', '2026-10-25', 2_500_000, 0, 'unpaid');
    const [, due] = groupCollections([today], isoDate('2026-10-01'), isoDate('2026-10-25'));
    expect(due?.items.map(({ state }) => state)).toEqual([{ group: 'due' }]);
    const settled = groupCollections([{ ...today, allocatedVnd: vnd(2_500_000), outstandingVnd: vnd(0), paymentStatus: 'paid' }], isoDate('2026-10-01'), isoDate('2026-10-25'));
    expect(settled.map(({ key, items }) => [key, items.length])).toEqual([['overdue', 0], ['due', 0], ['notDue', 0], ['paid', 1]]);
  });

  it('a partial row past due is overdue for what is still owed, and an overpaid row counts as paid for what came in', () => {
    const partial = row(DI_AN, 'Phòng 2', '2026-10-01', 2_500_000, 1_500_000, 'partial');
    const overpaid = row(DI_AN, 'Phòng 3', '2026-10-01', 2_500_000, 2_600_000, 'overpaid');
    const [overdue, , , paid] = groupCollections([partial, overpaid], isoDate('2026-10-01'), isoDate('2026-10-07'));
    expect(overdue?.items.map(({ state, amountVnd }) => ({ state, amountVnd }))).toEqual([{ state: { group: 'overdue', days: 6 }, amountVnd: 1_000_000 }]);
    expect(overdue?.totalVnd).toBe(1_000_000);
    expect(paid?.totalVnd).toBe(2_600_000);
  });

  it('carries an invoice from two months back with its own month, and a later as-of date grows the days', () => {
    const august = row(DI_AN, 'Phòng 4', '2026-08-25', 2_500_000, 0, 'unpaid');
    const [overdue] = groupCollections([august, ...october25], isoDate('2026-10-15'), isoDate('2026-10-25'));
    expect(overdue?.items.map(({ row: { dueDate }, state, carriedFrom }) => ({ dueDate, state, carriedFrom }))).toEqual([
      { dueDate: '2026-08-25', state: { group: 'overdue', days: 61 }, carriedFrom: '2026-08-01' },
    ]);
  });

  it('a month with no invoices has four empty groups at zero', () => {
    expect(groupCollections([], isoDate('2024-12-01'), isoDate('2026-10-07')).map(({ key, items, totalVnd }) => [key, items.length, totalVnd])).toEqual([
      ['overdue', 0, 0],
      ['due', 0, 0],
      ['notDue', 0, 0],
      ['paid', 0, 0],
    ]);
  });

  it('orders rooms by number, so Phòng 10 follows Phòng 9', () => {
    const rooms = [10, 9, 2].map((n) => row(DI_AN, `Phòng ${n}`, '2026-10-25', 2_500_000, 0, 'unpaid'));
    const [, , notDue] = groupCollections(rooms, isoDate('2026-10-01'), isoDate('2026-10-07'));
    expect(notDue?.items.map(({ row: { unitLabel } }) => unitLabel)).toEqual(['Phòng 2', 'Phòng 9', 'Phòng 10']);
  });
});

describe('worstCollectionState', () => {
  it('picks the longest overdue, then due, then not due, then paid', () => {
    expect(worstCollectionState([{ group: 'paid' }, { group: 'overdue', days: 3 }, { group: 'notDue' }, { group: 'overdue', days: 12 }])).toEqual({ group: 'overdue', days: 12 });
    expect(worstCollectionState([{ group: 'paid' }, { group: 'notDue' }, { group: 'due' }])).toEqual({ group: 'due' });
    expect(worstCollectionState([{ group: 'paid' }, { group: 'notDue' }])).toEqual({ group: 'notDue' });
    expect(worstCollectionState([{ group: 'paid' }])).toEqual({ group: 'paid' });
    expect(worstCollectionState([])).toBeNull();
  });
});
