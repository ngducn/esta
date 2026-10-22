import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, epochDay, fromEpochDay } from '../date/calendar';
import { isoDate } from '../date/iso-date';
import { EXPENSE_CATEGORY_IDS } from '../expenses';
import { MAX_AMOUNT_VND, vnd } from '../money/vnd';
import { buildLedger, type ExpenseFact, type IncomeFact } from './buildLedger';

const params = { seed: 20261007, numRuns: 500 };
const start = epochDay(isoDate('2024-01-01'));
const day = fc.integer({ min: 0, max: 3 * 366 }).map((offset) => fromEpochDay(start + offset));
const amount = fc.integer({ min: 1, max: MAX_AMOUNT_VND / 1000 }).map(vnd);
const incomeFact: fc.Arbitrary<IncomeFact> = fc.record({ receivedOn: day, amountVnd: amount });
const expenseFact: fc.Arbitrary<ExpenseFact> = fc.record({ paidOn: day, amountVnd: amount, category: fc.constantFrom(...EXPENSE_CATEGORY_IDS) });
const range = fc.tuple(day, fc.integer({ min: 0, max: 800 })).map(([from, length]) => ({ from, to: addDays(from, length) }));
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('buildLedger invariants', () => {
  it('ledger income over any range equals the input income received in that range', () => {
    fc.assert(
      fc.property(fc.array(incomeFact, { maxLength: 40 }), fc.array(expenseFact, { maxLength: 40 }), range, (incomes, expenses, { from, to }) => {
        const ledger = buildLedger({ incomes, expenses, from, to });
        const inRange = incomes.filter((fact) => fact.receivedOn >= from && fact.receivedOn <= to);
        expect(ledger.totals.incomeVnd).toBe(sum(inRange.map((fact) => fact.amountVnd)));
        expect(sum(ledger.months.map((row) => row.incomeVnd))).toBe(ledger.totals.incomeVnd);
      }),
      params,
    );
  });

  it('the total net equals the sum of month nets, and each month nets income minus its category spend', () => {
    fc.assert(
      fc.property(fc.array(incomeFact, { maxLength: 40 }), fc.array(expenseFact, { maxLength: 40 }), range, (incomes, expenses, { from, to }) => {
        const ledger = buildLedger({ incomes, expenses, from, to });
        expect(sum(ledger.months.map((row) => row.noiVnd))).toBe(ledger.totals.noiVnd);
        expect(ledger.totals.noiVnd).toBe(ledger.totals.incomeVnd - ledger.totals.expensesVnd);
        for (const row of ledger.months) {
          expect(sum(Object.values(row.byCategory))).toBe(row.expensesVnd);
          expect(row.noiVnd).toBe(row.incomeVnd - row.expensesVnd);
        }
      }),
      params,
    );
  });
});
