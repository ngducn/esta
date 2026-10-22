import type { IsoDate } from '@esta/core/date';
import { EXPENSE_CATEGORY_IDS } from '@esta/core/expenses';
import type { ExpenseFact, IncomeFact } from '@esta/core/ledger';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import type { Db } from './db';
import { readAll } from './kit';

const amountSchema = z.number().int().positive().transform(vnd);
const incomeSchema = z.object({ received_on: isoDateSchema, amount_vnd: amountSchema }).transform((row): IncomeFact => ({ receivedOn: row.received_on, amountVnd: row.amount_vnd }));
const expenseSchema = z
  .object({ paid_on: isoDateSchema, category: z.enum(EXPENSE_CATEGORY_IDS), amount_vnd: amountSchema })
  .transform((row): ExpenseFact => ({ paidOn: row.paid_on, category: row.category, amountVnd: row.amount_vnd }));

export type LedgerFacts = { readonly incomes: readonly IncomeFact[]; readonly expenses: readonly ExpenseFact[] };

/** Income and live expenses dated from `from` to `to`, both inclusive. */
export async function readLedgerFacts(db: Db, householdId: string, { propertyId, from, to }: { propertyId: string; from: IsoDate; to: IsoDate }): Promise<LedgerFacts> {
  const [incomes, expenses] = await Promise.all([
    readAll('the ledger income', (start, end) =>
      db
        .from('allocation_facts')
        .select('received_on, amount_vnd')
        .eq('household_id', householdId)
        .eq('property_id', propertyId)
        .gte('received_on', from)
        .lte('received_on', to)
        .order('payment_id')
        .order('invoice_id')
        .range(start, end),
    ),
    readAll('the ledger expenses', (start, end) =>
      db
        .from('expenses')
        .select('paid_on, category, amount_vnd')
        .eq('household_id', householdId)
        .eq('property_id', propertyId)
        .is('deleted_at', null)
        .gte('paid_on', from)
        .lte('paid_on', to)
        .order('id')
        .range(start, end),
    ),
  ]);
  return { incomes: z.array(incomeSchema).parse(incomes), expenses: z.array(expenseSchema).parse(expenses) };
}

export async function readLedgerStart(db: Db, householdId: string, propertyId: string): Promise<IsoDate | null> {
  const [income, expense] = await Promise.all([
    db.from('allocation_facts').select('day:received_on').eq('household_id', householdId).eq('property_id', propertyId).order('received_on').limit(1),
    db.from('expenses').select('day:paid_on').eq('household_id', householdId).eq('property_id', propertyId).is('deleted_at', null).order('paid_on').limit(1),
  ]);
  if (income.error) throw new Error(`Reading the first income failed: ${income.error.message}`);
  if (expense.error) throw new Error(`Reading the first expense failed: ${expense.error.message}`);
  const days = z.array(z.object({ day: isoDateSchema })).parse([...income.data, ...expense.data]).map((row) => row.day);
  return days.toSorted()[0] ?? null;
}
