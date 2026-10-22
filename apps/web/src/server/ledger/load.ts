import 'server-only';
import { isoDate, type IsoDate } from '@esta/core/date';
import { addDays, addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { EXPENSE_CATEGORIES } from '@esta/core/expenses';
import type { ExportTable } from '@esta/core/export';
import { formatMonthWithin } from '@esta/core/format';
import { buildLedger, ledgerToExportTable } from '@esta/core/ledger';
import { readLedgerFacts, readLedgerStart } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { createSessionClient } from '@/server/supabase/server';

export type LedgerYear = { readonly table: ExportTable; readonly empty: boolean };

function yearRange(year: number, today: IsoDate): { from: IsoDate; to: IsoDate } {
  const from = isoDate(`${year}-01-01`);
  const endOfMonth = addDays(addMonths(firstOfMonth(today), 1), -1);
  return { from, to: today.startsWith(`${year}-`) ? endOfMonth : isoDate(`${year}-12-31`) };
}

export async function loadLedgerYear(householdId: string, propertyId: string, year: number, today: IsoDate): Promise<LedgerYear> {
  const range = yearRange(year, today);
  const [facts, t] = await Promise.all([readLedgerFacts(await createSessionClient(), householdId, { propertyId, ...range }), getTranslations('ledger')]);
  const tCategory = await getTranslations('expenses');
  const locale = await getLocale();
  const table = ledgerToExportTable(buildLedger({ ...facts, ...range }), {
    month: t('month'),
    monthName: (first) => t('monthName', { month: formatMonthWithin(first, first, locale) }),
    income: t('income'),
    expenses: t('expenses'),
    noi: t('noi'),
    total: t('total'),
    category: (id) => tCategory(EXPENSE_CATEGORIES[id].labelKey),
  });
  return { table, empty: facts.incomes.length === 0 && facts.expenses.length === 0 };
}

export async function loadLedgerYears(householdId: string, propertyId: string, today: IsoDate): Promise<readonly number[]> {
  const start = await readLedgerStart(await createSessionClient(), householdId, propertyId);
  const thisYear = Number(today.slice(0, 4));
  const first = Math.min(thisYear, start === null ? thisYear : Number(start.slice(0, 4)));
  return Array.from({ length: thisYear - first + 1 }, (_, index) => thisYear - index);
}
