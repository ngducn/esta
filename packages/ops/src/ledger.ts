import type { IsoDate } from '@esta/core/date';
import { EXPENSE_CATEGORY_IDS } from '@esta/core/expenses';
import type { ExpenseFact, IncomeFact } from '@esta/core/ledger';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import type { Db } from './db';
import { readAll } from './kit';
import { readLivePropertyIds } from './valuations';

const amountSchema = z.number().int().positive().transform(vnd);
type OfProperty = { readonly propertyId: string };

const incomeSchema = z
  .object({ property_id: z.uuid(), received_on: isoDateSchema, amount_vnd: amountSchema })
  .transform((row): IncomeFact & OfProperty => ({ propertyId: row.property_id, receivedOn: row.received_on, amountVnd: row.amount_vnd }));
const expenseSchema = z
  .object({ property_id: z.uuid(), paid_on: isoDateSchema, category: z.enum(EXPENSE_CATEGORY_IDS), amount_vnd: amountSchema })
  .transform((row): ExpenseFact & OfProperty => ({ propertyId: row.property_id, paidOn: row.paid_on, category: row.category, amountVnd: row.amount_vnd }));

export type LedgerFacts = { readonly incomes: readonly (IncomeFact & OfProperty)[]; readonly expenses: readonly (ExpenseFact & OfProperty)[] };

/**
 * Income and live expenses dated from `from` to `to`, both inclusive, of one property or, without one, of every live
 * property, as Reports counts the household: an archived property's money leaves the household totals.
 */
export async function readLedgerFacts(db: Db, householdId: string, { propertyId, from, to }: { propertyId?: string; from: IsoDate; to: IsoDate }): Promise<LedgerFacts> {
  const scope = propertyId === undefined ? { household_id: householdId } : { household_id: householdId, property_id: propertyId };
  const [live, incomes, expenses] = await Promise.all([
    propertyId === undefined ? readLivePropertyIds(db, householdId).then((ids) => new Set(ids)) : null,
    readAll('the ledger income', (start, end) =>
      db
        .from('allocation_facts')
        .select('property_id, received_on, amount_vnd')
        .match(scope)
        .gte('received_on', from)
        .lte('received_on', to)
        .order('payment_id')
        .order('invoice_id')
        .range(start, end),
    ),
    readAll('the ledger expenses', (start, end) =>
      db
        .from('expenses')
        .select('property_id, paid_on, category, amount_vnd')
        .match(scope)
        .is('deleted_at', null)
        .gte('paid_on', from)
        .lte('paid_on', to)
        .order('id')
        .range(start, end),
    ),
  ]);
  const kept = <T extends OfProperty>(facts: T[]) => (live === null ? facts : facts.filter((fact) => live.has(fact.propertyId)));
  return { incomes: kept(z.array(incomeSchema).parse(incomes)), expenses: kept(z.array(expenseSchema).parse(expenses)) };
}

/** The day of the first income or live expense of one property or, without one, of every property; null when there is none. */
export async function readLedgerStart(db: Db, householdId: string, propertyId?: string): Promise<IsoDate | null> {
  const scope = propertyId === undefined ? { household_id: householdId } : { household_id: householdId, property_id: propertyId };
  const [income, expense] = await Promise.all([
    db.from('allocation_facts').select('day:received_on').match(scope).order('received_on').limit(1),
    db.from('expenses').select('day:paid_on').match(scope).is('deleted_at', null).order('paid_on').limit(1),
  ]);
  if (income.error) throw new Error(`Reading the first income failed: ${income.error.message}`);
  if (expense.error) throw new Error(`Reading the first expense failed: ${expense.error.message}`);
  const days = z.array(z.object({ day: isoDateSchema })).parse([...income.data, ...expense.data]).map((row) => row.day);
  return days.toSorted()[0] ?? null;
}
