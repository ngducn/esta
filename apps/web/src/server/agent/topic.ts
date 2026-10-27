import 'server-only';
import type { ThreadTopic } from '@esta/core/assistant';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

/** What her next message is about, with the record's own name: a note's title or a property's nickname. */
export type TopicChoice = { readonly topic: ThreadTopic; readonly name: string };

/**
 * The topic `?reply=` or `?about=` names, read through RLS: a note she may not read, an archived property or another
 * household's record gives none, so the box sends no topic `ask_in_thread` would refuse.
 */
export async function loadTopicChoice(householdId: string, { reply, about }: { readonly reply?: string; readonly about?: string }): Promise<TopicChoice | null> {
  const id = z.uuid().safeParse(reply ?? about);
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
