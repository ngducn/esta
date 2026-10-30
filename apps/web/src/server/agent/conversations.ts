import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { z } from 'zod';
import type { Db } from '@esta/ops';
import { isAnswerState, type AnswerState } from '@/components/assistant/answer-state';
import { createSessionClient } from '@/server/supabase/server';
import { canonicalStamp, inWindow, type Cursor, type Window } from './thread-cursor';

const answerRow = { content_md: z.string(), status: z.unknown(), refs: z.unknown(), deferred_until: z.string().nullable() };
function toAnswer({ content_md, status, refs, deferred_until }: { content_md: string; status: unknown; refs: unknown; deferred_until: string | null }): AnswerState {
  const answer = { content: content_md, status: status === 'streaming' && deferred_until !== null ? 'deferred' : status, refs };
  if (!isAnswerState(answer)) throw new Error(`An answer row has status ${JSON.stringify(status)} or refs that are not a list of links`);
  return answer;
}

export type MessageTopic = { readonly kind: 'item' | 'property'; readonly name: string; readonly href: string | null };

export type ConversationMessage = AnswerState & {
  readonly id: string;
  readonly conversationId: string;
  readonly role: 'user' | 'assistant';
  readonly createdAt: Instant;
  readonly cursor: Cursor;
  readonly topic: MessageTopic | null;
};

const topicColumns = {
  topic_item_id: z.uuid().nullable(),
  topic_property_id: z.uuid().nullable(),
  topic_note: z.object({ title: z.string() }).nullable(),
  topic_property: z.object({ nickname: z.string(), deleted_at: z.string().nullable() }).nullable(),
};

function topicOf(row: z.output<z.ZodObject<typeof topicColumns>>): MessageTopic | null {
  if (row.topic_note !== null && row.topic_item_id !== null) return { kind: 'item', name: row.topic_note.title, href: `/assistant?note=${row.topic_item_id}` };
  if (row.topic_property === null || row.topic_property_id === null) return null;
  return { kind: 'property', name: row.topic_property.nickname, href: row.topic_property.deleted_at === null ? `/properties/${row.topic_property_id}` : null };
}

const messageSchema = z
  .object({ id: z.uuid(), conversation_id: z.uuid(), role: z.enum(['user', 'assistant']), created_at: z.string(), ...answerRow, ...topicColumns })
  .transform(
    (row): ConversationMessage => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      createdAt: parseInstant(row.created_at),
      cursor: { stamp: canonicalStamp(row.created_at), rank: 1, id: row.id },
      topic: topicOf(row),
      ...toAnswer(row),
    }),
  );

/** A page of the messages of every conversation this member started, which RLS limits her to, from the window's cursor. */
export async function listMessages(householdId: string, window: Window): Promise<readonly ConversationMessage[]> {
  const db = await createSessionClient();
  const query = db.from('messages').select(
      'id, conversation_id, role, content_md, status, refs, deferred_until, created_at, topic_item_id, topic_property_id, topic_note:agent_items!messages_topic_item_fkey(title), topic_property:properties!messages_topic_property_fkey(nickname, deleted_at)',
    ).eq('household_id', householdId);
  const { data, error } = await inWindow(query, 1, window);
  if (error) throw new Error(`Reading the messages failed: ${error.message}`);
  return z.array(messageSchema).parse(data);
}

export async function readAnswer(db: Db, householdId: string, conversationId: string, answerId: string): Promise<AnswerState | null> {
  const { data, error } = await db
    .from('messages')
    .select('content_md, status, refs, deferred_until')
    .eq('household_id', householdId)
    .eq('conversation_id', conversationId)
    .eq('id', answerId)
    .eq('role', 'assistant')
    .maybeSingle();
  if (error) throw new Error(`Reading the answer failed: ${error.message}`);
  return data === null ? null : toAnswer(z.object(answerRow).parse(data));
}
