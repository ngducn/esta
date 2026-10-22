import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import type { ExpenseCategory } from '../expenses';
import { vnd } from '../money/vnd';
import { buildLedger, type ExpenseFact, type IncomeFact } from './buildLedger';

const income = (receivedOn: string, amount: number): IncomeFact => ({ receivedOn: isoDate(receivedOn), amountVnd: vnd(amount) });
const expense = (paidOn: string, category: ExpenseCategory, amount: number): ExpenseFact => ({
  paidOn: isoDate(paidOn),
  category,
  amountVnd: vnd(amount),
});
const year2026 = { from: isoDate('2026-01-01'), to: isoDate('2026-12-31') };
const month = (ledger: ReturnType<typeof buildLedger>, first: string) => ledger.months.find((row) => row.month === first);

describe('buildLedger (FIN-2)', () => {
  it('lists every month of the range in order, an empty month at zero', () => {
    const ledger = buildLedger({ incomes: [income('2026-03-05', 4_000_000)], expenses: [], ...year2026 });
    expect(ledger.months.map((row) => row.month)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01',
      '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
    ]);
    expect(month(ledger, '2026-02-01')).toMatchObject({ incomeVnd: 0, expensesVnd: 0, noiVnd: 0 });
  });

  it('adds two partial transfers received in one month', () => {
    const ledger = buildLedger({ incomes: [income('2026-10-05', 2_000_000), income('2026-10-20', 1_500_000)], expenses: [], ...year2026 });
    expect(month(ledger, '2026-10-01')?.incomeVnd).toBe(3_500_000);
  });

  it('counts money on the day it was received, whatever month the bill is for', () => {
    // A September transfer settling the October bill lands in September.
    const ledger = buildLedger({ incomes: [income('2026-09-28', 5_000_000)], expenses: [], ...year2026 });
    expect(month(ledger, '2026-09-01')?.incomeVnd).toBe(5_000_000);
    expect(month(ledger, '2026-10-01')?.incomeVnd).toBe(0);
  });

  it('groups expenses by category and nets them against income', () => {
    const ledger = buildLedger({
      incomes: [income('2026-04-02', 10_000_000)],
      expenses: [expense('2026-04-10', 'repair', 1_200_000), expense('2026-04-30', 'repair', 300_000), expense('2026-04-15', 'utility', 500_000)],
      ...year2026,
    });
    const april = month(ledger, '2026-04-01');
    expect(april?.byCategory.repair).toBe(1_500_000);
    expect(april?.byCategory.utility).toBe(500_000);
    expect(april?.byCategory.legal).toBe(0);
    expect(april?.expensesVnd).toBe(2_000_000);
    expect(april?.noiVnd).toBe(8_000_000);
  });

  it('shows a month that spent more than it took in as a negative net', () => {
    const ledger = buildLedger({ incomes: [], expenses: [expense('2026-05-01', 'land_tax', 750_000)], ...year2026 });
    expect(month(ledger, '2026-05-01')?.noiVnd).toBe(-750_000);
  });

  it('totals the year as the sum of its months', () => {
    const ledger = buildLedger({
      incomes: [income('2026-01-03', 4_000_000), income('2026-06-30', 4_000_000), income('2026-12-31', 4_000_000)],
      expenses: [expense('2026-01-01', 'repair', 100_000), expense('2026-12-31', 'insurance', 900_000)],
      ...year2026,
    });
    expect(ledger.totals).toMatchObject({ incomeVnd: 12_000_000, expensesVnd: 1_000_000, noiVnd: 11_000_000 });
    expect(ledger.totals.byCategory).toMatchObject({ repair: 100_000, insurance: 900_000 });
  });

  it('leaves out what falls outside the range', () => {
    const ledger = buildLedger({
      incomes: [income('2025-12-31', 1_000_000), income('2027-01-01', 1_000_000)],
      expenses: [expense('2025-12-31', 'repair', 1_000_000)],
      ...year2026,
    });
    expect(ledger.totals).toMatchObject({ incomeVnd: 0, expensesVnd: 0, noiVnd: 0 });
  });
});
