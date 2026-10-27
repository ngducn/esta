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

export type ConversationMessage = AnswerState & {
  readonly id: string;
  readonly conversationId: string;
  readonly role: 'user' | 'assistant';
  readonly createdAt: Instant;
  readonly cursor: Cursor;
};

const messageSchema = z
  .object({ id: z.uuid(), conversation_id: z.uuid(), role: z.enum(['user', 'assistant']), created_at: z.string(), ...answerRow })
  .transform(
    (row): ConversationMessage => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      createdAt: parseInstant(row.created_at),
      cursor: { stamp: canonicalStamp(row.created_at), rank: 1, id: row.id },
      ...toAnswer(row),
    }),
  );

/** A page of the messages of every conversation this member started, which RLS limits her to, from the window's cursor. */
export async function listMessages(householdId: string, window: Window): Promise<readonly ConversationMessage[]> {
  const db = await createSessionClient();
  const query = db.from('messages').select('id, conversation_id, role, content_md, status, refs, deferred_until, created_at').eq('household_id', householdId);
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
