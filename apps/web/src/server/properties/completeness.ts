import 'server-only';
import {
  COMPLETENESS_CHECKS,
  COMPLETENESS_FACT_COLUMNS,
  completenessFactsRowSchema,
  scoreProperty,
  type CompletenessCheckId,
  type CompletenessResult,
} from '@esta/core/completeness';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type PropertyCompleteness = CompletenessResult<CompletenessCheckId>;

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

/** Scores the household's live properties, or only `propertyId`, from `property_completeness_facts` under RLS. */
export async function loadCompleteness(householdId: string, propertyId?: string): Promise<Map<string, PropertyCompleteness>> {
  const supabase = await createSessionClient();
  const scores = new Map<string, PropertyCompleteness>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('property_completeness_facts').select(COMPLETENESS_FACT_COLUMNS).eq('household_id', householdId);
    if (propertyId !== undefined) query = query.eq('property_id', propertyId);
    const { data, error } = await query.order('property_id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading completeness failed: ${error.message}`);
    for (const facts of z.array(completenessFactsRowSchema).parse(data)) scores.set(facts.propertyId, scoreProperty(facts, COMPLETENESS_CHECKS));
    if (data.length < PAGE_SIZE) return scores;
  }
}
