import 'server-only';
import {
  applyPropertyFilters,
  propertyStatus,
  statusFilterValues,
  searchTokens,
  type FilteredProperties,
  type PropertyFilters,
  type PropertyListRow,
  type PropertyTotals,
  propertyTotals,
  type PropertyStatusMark,
  type PropertyViewRow,
} from '@esta/core/properties';
import type { IsoDate } from '@esta/core/date';
import { rentInEffect } from '@esta/core/lease';
import { searchProperties, type Db, type PropertyRow } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';
import { loadCollectionStates } from '@/server/collections/load';
import { loadHoldingLeases, type HoldingLeases } from '@/server/leases/load';
import { loadCompleteness, type PropertyCompleteness } from './completeness';

type LeaseFactKey = 'leasedUnitCount' | 'monthlyRentVnd';

/**
 * What the leases holding units on `asOf` say about one property: how many units are let, and the monthly rent owed
 * under the leases in effect. `property_list_rows` cannot say either, because a view has no business date.
 */
export function leaseFacts(propertyId: string, holding: HoldingLeases, asOf: IsoDate): Pick<PropertyViewRow, LeaseFactKey> {
  const leases = holding.leases.filter((lease) => lease.property_id === propertyId);
  return { leasedUnitCount: new Set(leases.map((lease) => lease.unit_id)).size, monthlyRentVnd: rentInEffect(leases, holding.schedule, asOf) };
}

export type PropertyList = FilteredProperties & {
  householdCount: number;
  totals: PropertyTotals;
  provinceNames: ReadonlyMap<string, string>;
  ownerNames: ReadonlyMap<string, string>;
  /** Each shown row's `propertyStatus` marks on the Clock's date; a row with none is absent. */
  statuses: ReadonlyMap<string, readonly PropertyStatusMark[]>;
};

async function readOwnerNames(supabase: Db, householdId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('parties').select('id, full_name').eq('household_id', householdId);
  if (error) throw new Error(`Reading owner names failed: ${error.message}`);
  return new Map(data.map((party) => [party.id, party.full_name]));
}

/** A property created between the two reads has no facts yet; it shows as complete until the next load. */
function summary(score: PropertyCompleteness | undefined): PropertyListRow['completeness'] {
  return score === undefined ? { percent: 100, missing: 0 } : { percent: score.percent, missing: score.failing.length };
}

/** RLS already limits the rows to the member's households; the household predicate keeps a member of two to one list. */
export async function listProperties(householdId: string, filters: PropertyFilters, asOf: IsoDate): Promise<PropertyList> {
  const supabase = await createSessionClient();
  const tokens = searchTokens(filters.q);
  const [viewRows, everyRow, ownerNames, scores, holding, collections] = await Promise.all([
    searchProperties(supabase, householdId, tokens),
    tokens.length === 0 ? null : searchProperties(supabase, householdId, []),
    readOwnerNames(supabase, householdId),
    loadCompleteness(householdId),
    loadHoldingLeases(householdId, asOf),
    loadCollectionStates(householdId, asOf),
  ]);
  const marksById = new Map<string, readonly PropertyStatusMark[]>();
  const toListRow = (row: PropertyRow): PropertyListRow => {
    const facts = { ...row, ...leaseFacts(row.id, holding, asOf), collection: collections?.get(row.id) ?? null };
    const marks = propertyStatus(facts, asOf);
    marksById.set(row.id, marks);
    return { ...row, ...facts, completeness: summary(scores.get(row.id)), statusKeys: statusFilterValues(facts, marks) };
  };
  const matches = viewRows.map(toListRow);
  const household = everyRow === null ? matches : everyRow.map(toListRow);
  const filtered = applyPropertyFilters(matches, filters);
  return {
    ...filtered,
    statuses: new Map(
      filtered.rows.flatMap((row) => {
        const marks = marksById.get(row.id) ?? [];
        return marks.length === 0 ? [] : [[row.id, marks] as const];
      }),
    ),
    householdCount: household.length,
    totals: propertyTotals(household, collections !== null),
    ownerNames,
    provinceNames: new Map(
      matches.flatMap((row) => (row.provinceCode === null || row.provinceName === null ? [] : [[row.provinceCode, row.provinceName] as const])),
    ),
  };
}
