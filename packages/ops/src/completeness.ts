import { COMPLETENESS_CHECKS, COMPLETENESS_FACT_COLUMNS, completenessFactsRowSchema, scoreProperty, type CompletenessCheckId, type CompletenessResult } from '@esta/core/completeness';
import { z } from 'zod';
import type { Db } from './db';
import { readAll } from './kit';

export type PropertyCompleteness = CompletenessResult<CompletenessCheckId>;

/** Scores the household's live properties, or only `propertyId`, from `property_completeness_facts`. */
export async function readCompleteness(db: Db, householdId: string, propertyId?: string): Promise<Map<string, PropertyCompleteness>> {
  const rows = await readAll('completeness', (from, to) => {
    const query = db.from('property_completeness_facts').select(COMPLETENESS_FACT_COLUMNS).eq('household_id', householdId);
    return (propertyId === undefined ? query : query.eq('property_id', propertyId)).order('property_id').range(from, to);
  });
  return new Map(z.array(completenessFactsRowSchema).parse(rows).map((facts) => [facts.propertyId, scoreProperty(facts, COMPLETENESS_CHECKS)]));
}
