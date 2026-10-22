import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { portfolioValue, type Portfolio, type Valuation } from '@esta/core/valuations';
import { readLivePropertyIds, readValuations } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';

export async function loadPropertyValuations(householdId: string, propertyId: string): Promise<readonly Valuation[]> {
  return readValuations(await createSessionClient(), householdId, propertyId);
}

/** Home's portfolio figure on the Clock's date; `null` when no property has a valuation yet. */
export async function loadPortfolio(householdId: string, asOf: IsoDate): Promise<Portfolio | null> {
  const db = await createSessionClient();
  const [propertyIds, valuations] = await Promise.all([readLivePropertyIds(db, householdId), readValuations(db, householdId)]);
  return portfolioValue(propertyIds, valuations, asOf);
}
