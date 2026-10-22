import { addMonths, firstOfMonth } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { EXPENSE_CATEGORY_IDS, type ExpenseCategory } from '../expenses';
import { vnd, type Vnd } from '../money/vnd';

/** Money a tenant paid that settled a bill, on the day the payment was received (`allocation_facts`). */
export type IncomeFact = { readonly receivedOn: IsoDate; readonly amountVnd: Vnd };
export type ExpenseFact = { readonly paidOn: IsoDate; readonly category: ExpenseCategory; readonly amountVnd: Vnd };

export type LedgerSums = {
  readonly incomeVnd: Vnd;
  readonly byCategory: Readonly<Record<ExpenseCategory, Vnd>>;
  readonly expensesVnd: Vnd;
  readonly noiVnd: Vnd;
};
/** `month` is the month's first day. */
export type LedgerMonth = LedgerSums & { readonly month: IsoDate };
export type Ledger = { readonly months: readonly LedgerMonth[]; readonly totals: LedgerSums };

type Tally = { income: number; byCategory: Record<ExpenseCategory, number> };

const emptyTally = (): Tally => ({ income: 0, byCategory: Object.fromEntries(EXPENSE_CATEGORY_IDS.map((id) => [id, 0])) as Record<ExpenseCategory, number> });

function sums(tally: Tally): LedgerSums {
  const expenses = EXPENSE_CATEGORY_IDS.reduce((total, id) => total + tally.byCategory[id], 0);
  return {
    incomeVnd: vnd(tally.income),
    byCategory: Object.fromEntries(EXPENSE_CATEGORY_IDS.map((id) => [id, vnd(tally.byCategory[id])])) as Record<ExpenseCategory, Vnd>,
    expensesVnd: vnd(expenses),
    noiVnd: vnd(tally.income - expenses),
  };
}

/**
 * FIN-2 on a cash basis: one row per month from `from` to `to`, both inclusive, with income on the day it was received
 * and expenses on the day they were paid. Facts outside the range are left out, and the totals are the months' sums.
 */
export function buildLedger({ incomes, expenses, from, to }: { incomes: readonly IncomeFact[]; expenses: readonly ExpenseFact[]; from: IsoDate; to: IsoDate }): Ledger {
  const tallies = new Map<IsoDate, Tally>();
  for (let month = firstOfMonth(from); month <= to; month = addMonths(month, 1)) tallies.set(month, emptyTally());
  const tallyOn = (date: IsoDate) => (date >= from && date <= to ? tallies.get(firstOfMonth(date)) : undefined);
  for (const fact of incomes) {
    const tally = tallyOn(fact.receivedOn);
    if (tally !== undefined) tally.income += fact.amountVnd;
  }
  for (const fact of expenses) {
    const tally = tallyOn(fact.paidOn);
    if (tally !== undefined) tally.byCategory[fact.category] += fact.amountVnd;
  }
  const total = emptyTally();
  for (const tally of tallies.values()) {
    total.income += tally.income;
    for (const id of EXPENSE_CATEGORY_IDS) total.byCategory[id] += tally.byCategory[id];
  }
  return { months: [...tallies].map(([month, tally]) => ({ month, ...sums(tally) })), totals: sums(total) };
}
