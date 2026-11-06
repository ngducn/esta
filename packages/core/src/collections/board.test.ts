import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '../allocation/status';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { boardGroups, boardTotals, longestOverdueDays, parseBoardFilter } from './board';
import { groupCollections, monthCollected, type CollectionCandidate } from './group';

function bill(unitLabel: string, dueDate: string, totalVnd: number, allocatedVnd: number, paymentStatus: PaymentStatus): CollectionCandidate {
  return {
    invoiceId: `${unitLabel}:${dueDate}`,
    propertyId: 'di-an',
    propertyName: 'Dãy trọ Dĩ An',
    unitLabel,
    dueDate: isoDate(dueDate),
    totalVnd: vnd(totalVnd),
    allocatedVnd: vnd(allocatedVnd),
    outstandingVnd: vnd(Math.max(totalVnd - allocatedVnd, 0)),
    paymentStatus,
  };
}

const BILLS = [
  bill('Phòng 1', '2026-08-25', 2_100_000, 0, 'unpaid'),
  bill('Phòng 2', '2026-09-25', 2_800_000, 700_000, 'partial'),
  bill('Phòng 3', '2026-10-07', 2_500_000, 0, 'unpaid'),
  bill('Phòng 4', '2026-10-25', 3_200_000, 1_000_000, 'partial'),
  bill('Phòng 5', '2026-10-25', 2_600_000, 0, 'unpaid'),
  bill('Phòng 6', '2026-10-01', 9_000_000, 9_000_000, 'paid'),
];
const BOARD = groupCollections(BILLS, isoDate('2026-10-01'), isoDate('2026-10-07'));

describe('parseBoardFilter', () => {
  it.each([
    ['overdue', 'overdue'],
    ['due', 'due'],
    ['notDue', 'notDue'],
    ['paid', 'paid'],
    ['all', 'all'],
  ] as const)('reads ?status=%s as %s', (param, filter) => {
    expect(parseBoardFilter(param)).toBe(filter);
  });

  it.each([undefined, '', 'OVERDUE', 'late', 'paid ', 'toString'])('falls back to every bill for %j', (param) => {
    expect(parseBoardFilter(param)).toBe('all');
  });
});

describe('boardGroups', () => {
  it('shows every group in board order for all, and one group for a status', () => {
    expect(boardGroups(BOARD, 'all').map((group) => group.key)).toEqual(['overdue', 'due', 'notDue', 'paid']);
    expect(boardGroups(BOARD, 'notDue').map((group) => group.items.map((item) => item.row.unitLabel))).toEqual([['Phòng 4', 'Phòng 5']]);
  });
});

describe('boardTotals', () => {
  it('sums what every listed bill still owes, partial payments included', () => {
    expect(boardTotals(boardGroups(BOARD, 'all'))).toEqual({ count: 6, owedVnd: 2_100_000 + 2_100_000 + 2_500_000 + 2_200_000 + 2_600_000 });
  });

  it('sums only the bills a status tab lists', () => {
    expect(boardTotals(boardGroups(BOARD, 'overdue'))).toEqual({ count: 2, owedVnd: 2_100_000 + 2_100_000 });
    expect(boardTotals(boardGroups(BOARD, 'due'))).toEqual({ count: 1, owedVnd: 2_500_000 });
    expect(boardTotals(boardGroups(BOARD, 'paid'))).toEqual({ count: 1, owedVnd: 0 });
  });

  it('reads an empty tab as a known zero', () => {
    const quiet = groupCollections(BILLS.slice(5), isoDate('2026-10-01'), isoDate('2026-10-07'));
    expect(boardTotals(boardGroups(quiet, 'overdue'))).toEqual({ count: 0, owedVnd: 0 });
  });
});

describe("the strip's Đã thu", () => {
  it('counts what came in toward the month’s own bills, each capped at its bill, as Tổng quan does, and the total row has no Đã thu of its own', () => {
    const rows = [bill('Phòng 2', '2026-09-25', 2_800_000, 700_000, 'partial'), bill('Phòng 3', '2026-10-25', 2_500_000, 3_000_000, 'overpaid'), bill('Phòng 4', '2026-10-25', 3_200_000, 1_000_000, 'partial')];
    const board = groupCollections(rows, isoDate('2026-10-01'), isoDate('2026-10-07'));
    expect(monthCollected(rows.filter((row) => row.dueDate.startsWith('2026-10')))).toEqual({ collectedVnd: 2_500_000 + 1_000_000, billedVnd: 2_500_000 + 3_200_000 });
    expect(boardTotals(board)).toEqual({ count: 3, owedVnd: 2_100_000 + 2_200_000 });
  });
});

describe('longestOverdueDays', () => {
  it('is the oldest overdue bill in days, or null when nothing is overdue', () => {
    expect(longestOverdueDays(BOARD)).toBe(43);
    expect(longestOverdueDays(groupCollections(BILLS.slice(2), isoDate('2026-10-01'), isoDate('2026-10-07')))).toBeNull();
  });
});
