import 'server-only';
import { reduceNationalIds } from '@esta/core/agent-schemas';
import type { createSessionClient } from '@/server/supabase/server';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

export type Typed<F extends string> = readonly (readonly [field: F, text: string])[];

/**
 * The fields whose typed text holds a full national ID (SPEC D11), by the reducer or by the database judge, which reads
 * by the rule of every CHECK, so a save that asks first writes nothing it would have refused. Null when the judge did
 * not answer.
 */
export async function fieldsHoldingIds<F extends string>(supabase: SessionClient, typed: Typed<F>): Promise<F[] | null> {
  if (typed.length === 0) return [];
  const { data, error } = await supabase.rpc('national_id_indexes', { p_values: typed.map(([, text]) => text) });
  if (error) return null;
  const held = typed.filter(([, text], index) => data.includes(index) || reduceNationalIds(text) !== text);
  return [...new Set(held.map(([field]) => field))];
}
