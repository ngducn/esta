import 'server-only';
import { readCompleteness, type PropertyCompleteness } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';

export type { PropertyCompleteness };

/** Scores the household's live properties, or only `propertyId`, under RLS. */
export async function loadCompleteness(householdId: string, propertyId?: string): Promise<Map<string, PropertyCompleteness>> {
  return readCompleteness(await createSessionClient(), householdId, propertyId);
}
