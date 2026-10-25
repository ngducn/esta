import { addDays, addMonths } from '@esta/core/date/calendar';
import { isoDate } from '@esta/core/date';
import { formatMonthYear, formatVnd, formatYear, type Locale } from '@esta/core/format';
import { buildLedger } from '@esta/core/ledger';
import { estaUri } from '@esta/core/links';
import { readLedgerFacts } from '@esta/ops';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';
import type { PropertyRecord } from './list-properties';
import { ToolRejection } from './server';

const inputSchema = z.strictObject({ property: z.string(), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });

export function ledgerTool(db: AgentDb, householdId: string, locale: Locale, properties: ReadonlyMap<string, CitedRecord<PropertyRecord>>, cite: RunSheet['cite']) {
  const byCall = new Map<string, unknown>();
  return async (raw: Record<string, unknown>) => {
    const input = inputSchema.safeParse(raw);
    if (!input.success) throw new ToolRejection(`ledger takes {"property": a handle from list_properties, "year", "month": 1 to 12}: ${input.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ')}`);
    const { property: handle, year, month } = input.data;
    const property = properties.get(handle);
    if (property === undefined) throw new ToolRejection(`property: ${handle} is not a property list_properties returned in this run`);
    const key = JSON.stringify([handle, year, month]);
    const earlier = byCall.get(key);
    if (earlier !== undefined) return earlier;

    const from = isoDate(`${formatYear(year)}-${String(month).padStart(2, '0')}-01`);
    const to = addDays(addMonths(from, 1), -1);
    const { totals } = buildLedger({ ...(await readLedgerFacts(db, householdId, { propertyId: property.id, from, to })), from, to });
    const record = cite({
      property_label: property.property_label,
      period_date_display: formatMonthYear(from, locale),
      income_display: formatVnd(totals.incomeVnd, locale),
      expenses_display: formatVnd(totals.expensesVnd, locale),
      net_display: formatVnd(totals.noiVnd, locale),
      link: estaUri({ type: 'ledger', id: property.id }),
    });
    byCall.set(key, record);
    return record;
  };
}
