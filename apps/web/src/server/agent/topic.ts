import 'server-only';
import type { ThreadTopic } from '@esta/core/assistant';
import { idSchema } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';

export type TopicChoice = { readonly topic: ThreadTopic; readonly name: string };

export async function loadTopicChoice(householdId: string, { reply, about }: { readonly reply?: string; readonly about?: string }): Promise<TopicChoice | null> {
  const id = idSchema.safeParse(reply ?? about);
  if (!id.success) return null;
  const db = await createSessionClient();
  if (reply !== undefined) {
    const { data, error } = await db.from('agent_items').select('title').eq('household_id', householdId).eq('id', id.data).maybeSingle();
    if (error) throw new Error(`Reading the note failed: ${error.message}`);
    return data === null ? null : { topic: { kind: 'item', itemId: id.data }, name: data.title };
  }
  const { data, error } = await db.from('properties').select('nickname').eq('household_id', householdId).eq('id', id.data).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`Reading the property failed: ${error.message}`);
  return data === null ? null : { topic: { kind: 'property', propertyId: id.data }, name: data.nickname };
}
