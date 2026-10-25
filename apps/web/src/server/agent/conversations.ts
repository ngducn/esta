import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { z } from 'zod';
import type { Db } from '@esta/ops';
import { isAnswerState, type AnswerState } from '@/components/assistant/answer-state';
import { createSessionClient } from '@/server/supabase/server';

const answerRow = { content_md: z.string(), status: z.unknown(), refs: z.unknown() };
function toAnswer({ content_md, status, refs }: { content_md: string; status: unknown; refs: unknown }): AnswerState {
  const answer = { content: content_md, status, refs };
  if (!isAnswerState(answer)) throw new Error(`An answer row has status ${JSON.stringify(status)} or refs that are not a list of links`);
  return answer;
}

export type ConversationMessage = AnswerState & { readonly id: string; readonly role: 'user' | 'assistant'; readonly createdAt: Instant };

export type Conversation = { readonly id: string; readonly title: string; readonly messages: readonly ConversationMessage[] };

const messageSchema = z
  .object({ id: z.uuid(), role: z.enum(['user', 'assistant']), created_at: z.string(), ...answerRow })
  .transform((row): ConversationMessage => ({ id: row.id, role: row.role, createdAt: parseInstant(row.created_at), ...toAnswer(row) }));

export async function loadConversation(householdId: string, id: string): Promise<Conversation | null> {
  const db = await createSessionClient();
  const [conversation, messages] = await Promise.all([
    db.from('conversations').select('id, title').eq('household_id', householdId).eq('id', id).maybeSingle(),
    db.from('messages').select('id, role, content_md, status, refs, created_at').eq('household_id', householdId).eq('conversation_id', id).order('created_at'),
  ]);
  if (conversation.error) throw new Error(`Reading the conversation failed: ${conversation.error.message}`);
  if (messages.error) throw new Error(`Reading the messages failed: ${messages.error.message}`);
  if (conversation.data === null) return null;
  return { id: conversation.data.id, title: conversation.data.title, messages: z.array(messageSchema).parse(messages.data) };
}

export async function readAnswer(db: Db, householdId: string, conversationId: string, answerId: string): Promise<AnswerState | null> {
  const { data, error } = await db
    .from('messages')
    .select('content_md, status, refs')
    .eq('household_id', householdId)
    .eq('conversation_id', conversationId)
    .eq('id', answerId)
    .eq('role', 'assistant')
    .maybeSingle();
  if (error) throw new Error(`Reading the answer failed: ${error.message}`);
  return data === null ? null : toAnswer(z.object(answerRow).parse(data));
}
