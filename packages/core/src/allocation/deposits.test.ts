import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { deriveDepositLedger, type DepositEntry, type DepositKind } from './deposits';

function entry(id: string, kind: DepositKind, amount: number, onDate: string): DepositEntry {
  return { id, kind, amountVnd: vnd(amount), onDate: isoDate(onDate) };
}

function held(entries: readonly DepositEntry[]) {
  const result = deriveDepositLedger(entries);
  if (!result.ok) throw new Error(result.reason);
  return { rows: result.value.rows.map((row) => [row.id, row.heldVnd]), heldVnd: result.value.heldVnd };
}

describe('deriveDepositLedger', () => {
  it('holds nothing without entries', () => {
    expect(held([])).toEqual({ rows: [], heldVnd: 0 });
  });

  it('holds what was received', () => {
    expect(held([entry('r', 'received', 3_500_000, '2025-09-15')])).toEqual({ rows: [['r', 3_500_000]], heldVnd: 3_500_000 });
  });

  it('runs the balance through received, applied, deducted and refunded entries', () => {
    const entries = [
      entry('received', 'received', 7_000_000, '2025-01-10'),
      entry('applied', 'applied', 3_500_000, '2026-07-25'),
      entry('deduction', 'deduction', 500_000, '2026-07-29'),
      entry('refunded', 'refunded', 3_000_000, '2026-08-05'),
    ];
    expect(held(entries)).toEqual({
      rows: [
        ['received', 7_000_000],
        ['applied', 3_500_000],
        ['deduction', 3_000_000],
        ['refunded', 0],
      ],
      heldVnd: 0,
    });
  });

  it('orders entries by date and keeps same-day entries in the order given', () => {
    const entries = [
      entry('refund', 'refunded', 1_000_000, '2026-08-05'),
      entry('topup', 'received', 1_000_000, '2026-03-01'),
      entry('first', 'received', 2_000_000, '2026-03-01'),
    ];
    expect(held(entries).rows).toEqual([
      ['topup', 1_000_000],
      ['first', 3_000_000],
      ['refund', 2_000_000],
    ]);
  });

  it.each(['applied', 'deduction', 'refunded'] as const)('refuses %s above the held balance and names the entry', (kind) => {
    const entries = [entry('received', 'received', 3_500_000, '2025-09-15'), entry('over', kind, 3_500_001, '2026-09-20')];
    expect(deriveDepositLedger(entries)).toEqual({ ok: false, reason: 'exceeds_held', entryId: 'over', heldVnd: 3_500_000 });
  });

  it('refuses a refund before anything was received', () => {
    expect(deriveDepositLedger([entry('early', 'refunded', 1, '2026-01-01')])).toEqual({
      ok: false,
      reason: 'exceeds_held',
      entryId: 'early',
      heldVnd: 0,
    });
  });

  it.each([0, -1_000])('refuses an entry of %i', (amount) => {
    expect(deriveDepositLedger([entry('zero', 'received', amount, '2026-01-01')])).toEqual({
      ok: false,
      reason: 'non_positive_amount',
      entryId: 'zero',
    });
  });
});
