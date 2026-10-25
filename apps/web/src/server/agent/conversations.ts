import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { cache } from 'react';
import { z } from 'zod';
import type { Db } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';

const statusSchema = z.enum(['streaming', 'done', 'error']);
export type AnswerStatus = z.infer<typeof statusSchema>;

export type AnswerState = { readonly content: string; readonly status: AnswerStatus };

export type ConversationMessage = AnswerState & { readonly id: string; readonly role: 'user' | 'assistant'; readonly createdAt: Instant };

export type Conversation = { readonly id: string; readonly title: string; readonly messages: readonly ConversationMessage[] };

const messageSchema = z
  .object({ id: z.uuid(), role: z.enum(['user', 'assistant']), content_md: z.string(), status: statusSchema, created_at: z.string() })
  .transform((row): ConversationMessage => ({ id: row.id, role: row.role, content: row.content_md, status: row.status, createdAt: parseInstant(row.created_at) }));

/** One conversation with its messages in order, through the member's session; null when RLS shows her none. */
export const loadConversation = cache(async (householdId: string, id: string): Promise<Conversation | null> => {
  const db = await createSessionClient();
  const [conversation, messages] = await Promise.all([
    db.from('conversations').select('id, title').eq('household_id', householdId).eq('id', id).maybeSingle(),
    db.from('messages').select('id, role, content_md, status, created_at').eq('household_id', householdId).eq('conversation_id', id).order('created_at'),
  ]);
  if (conversation.error) throw new Error(`Reading the conversation failed: ${conversation.error.message}`);
  if (messages.error) throw new Error(`Reading the messages failed: ${messages.error.message}`);
  if (conversation.data === null) return null;
  return { id: conversation.data.id, title: conversation.data.title, messages: z.array(messageSchema).parse(messages.data) };
});

/** The answer row the stream route watches; null when the member cannot see it. */
export async function readAnswer(db: Db, householdId: string, conversationId: string, answerId: string): Promise<AnswerState | null> {
  const { data, error } = await db
    .from('messages')
    .select('content_md, status')
    .eq('household_id', householdId)
    .eq('conversation_id', conversationId)
    .eq('id', answerId)
    .eq('role', 'assistant')
    .maybeSingle();
  if (error) throw new Error(`Reading the answer failed: ${error.message}`);
  return data === null ? null : { content: data.content_md, status: statusSchema.parse(data.status) };
}
