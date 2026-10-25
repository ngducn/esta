import { addDays, addMonths } from '@esta/core/date/calendar';
import { isoDate, type IsoDate } from '@esta/core/date';
import { formatMonthYear, formatVnd, formatYear, type Locale } from '@esta/core/format';
import { buildLedger, type LedgerSums } from '@esta/core/ledger';
import { estaUri } from '@esta/core/links';
import { readLedgerFacts } from '@esta/ops';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';
import type { PropertyRecord } from './list-properties';
import { ToolRejection } from './server';

const inputSchema = z.strictObject({ property: z.string().optional(), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12).optional() });

export type LedgerRecord = {
  readonly property_label: string | null;
  readonly period_date_display: string;
  readonly income_display: string;
  readonly expenses_display: string;
  readonly net_display: string;
  /** The property's Thu chi tab, which an answer links as `[text](fN)`; none for the whole household. */
  readonly link: string | null;
};

function sumsRecord(sums: LedgerSums, period: string, property: CitedRecord<PropertyRecord> | null, locale: Locale): LedgerRecord {
  return {
    property_label: property?.property_label ?? null,
    period_date_display: period,
    income_display: formatVnd(sums.incomeVnd, locale),
    expenses_display: formatVnd(sums.expensesVnd, locale),
    net_display: formatVnd(sums.noiVnd, locale),
    link: property === null ? null : estaUri({ type: 'ledger', id: property.id }),
  };
}

const monthStart = (year: number, month: number): IsoDate => isoDate(`${formatYear(year)}-${String(month).padStart(2, '0')}-01`);

/**
 * `ledger` (AGENT.md §4): income by the day each payment was received and live expenses, for one month or one year,
 * of one property or of the whole household. The same call answers the same record under the same handle.
 */
export function ledgerTool(db: AgentDb, householdId: string, locale: Locale, properties: ReadonlyMap<string, CitedRecord<PropertyRecord>>, cite: RunSheet['cite']) {
  const answered = new Map<string, unknown>();
  return async (raw: Record<string, unknown>) => {
    const input = inputSchema.safeParse(raw);
    if (!input.success) throw new ToolRejection(`ledger takes {"property": a handle from list_properties (optional), "year", "month" (optional, 1 to 12)}: ${input.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ')}`);
    const { property: handle, year, month } = input.data;
    const property = handle === undefined ? null : (properties.get(handle) ?? null);
    if (handle !== undefined && property === null) throw new ToolRejection(`property: ${handle} is not a property list_properties returned in this run`);
    const key = JSON.stringify([handle ?? null, year, month ?? null]);
    const earlier = answered.get(key);
    if (earlier !== undefined) return earlier;

    const from = monthStart(year, month ?? 1);
    const to = addDays(addMonths(from, month === undefined ? 12 : 1), -1);
    const ledger = buildLedger({ ...(await readLedgerFacts(db, householdId, { ...(property === null ? {} : { propertyId: property.id }), from, to })), from, to });
    const total = cite(sumsRecord(ledger.totals, month === undefined ? formatYear(year) : formatMonthYear(from, locale), property, locale));
    answered.set(key, total);
    return total;
  };
}
