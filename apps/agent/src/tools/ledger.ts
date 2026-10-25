import { addDays, addMonths } from '@esta/core/date/calendar';
import { EXPENSE_CATEGORY_IDS } from '@esta/core/expenses';
import { formatMonthYear, formatVnd, formatYear, type Locale } from '@esta/core/format';
import { buildLedger, type LedgerSums } from '@esta/core/ledger';
import { estaUri } from '@esta/core/links';
import { readLedgerFacts } from '@esta/ops';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import { monthStart } from './ask-reads';
import { sameAnswer, type RunSheet } from './fact-sheet';
import { propertyByHandle, type PropertyHandles } from './list-properties';
import { parseToolInput } from './server';

const inputSchema = z.strictObject({
  property: z.string().optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
});
const USAGE = 'ledger takes {"property": a handle from list_properties, or none for the whole household, "year", "month": 1 to 12, or none for the whole year}';

/** `ledger` (AGENT.md §4): income received and expenses paid in a month or a year, at one property or the whole household. */
export function ledgerTool(db: AgentDb, householdId: string, locale: Locale, properties: PropertyHandles, cite: RunSheet['cite']) {
  const amounts = (sums: LedgerSums) => ({
    income_display: formatVnd(sums.incomeVnd, locale),
    expenses_display: formatVnd(sums.expensesVnd, locale),
    net_display: formatVnd(sums.noiVnd, locale),
  });
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const { property: handle, year, month } = parseToolInput(inputSchema, raw, USAGE);
    const property = handle === undefined ? null : propertyByHandle(properties, handle);
    const from = monthStart(year, month ?? 1);
    const to = addDays(addMonths(from, month === undefined ? 12 : 1), -1);
    const facts = await readLedgerFacts(db, householdId, { ...(property === null ? {} : { propertyId: property.id }), from, to });
    const { totals, months } = buildLedger({ ...facts, from, to });
    const ledger = cite({
      property_label: property?.property_label ?? null,
      period_date_display: month === undefined ? formatYear(year) : formatMonthYear(from, locale),
      ...amounts(totals),
      link: property === null ? null : estaUri({ type: 'ledger', id: property.id }),
    });
    const expensesByCategory = EXPENSE_CATEGORY_IDS.filter((category) => totals.byCategory[category] > 0).map((category) =>
      cite({ category, amount_display: formatVnd(totals.byCategory[category], locale) }),
    );
    if (month !== undefined) return { ledger, expenses_by_category: expensesByCategory };
    return { ledger, expenses_by_category: expensesByCategory, by_month: months.map((row) => cite({ month_date_display: formatMonthYear(row.monthStart, locale), ...amounts(row) })) };
  });
}
