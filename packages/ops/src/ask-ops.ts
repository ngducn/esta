import { threadTopicSchema, type ThreadTopic } from '@esta/core/assistant';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged } from './op';

export const MAX_QUESTION_LENGTH = 2000;

const inputSchema = z.strictObject({
  questionId: idSchema,
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  deep: z.boolean().default(false),
  topic: threadTopicSchema.nullable().default(null),
});
type AskInput = z.output<typeof inputSchema>;

/** `ask_in_thread` checks that she may open the note or property the topic names. */
const topicPayload = (topic: ThreadTopic) => (topic.kind === 'item' ? { kind: 'item', id: topic.itemId } : { kind: 'property', id: topic.propertyId });

/** The conversation, the thread's segment, that the message joined. */
export type Asked = { readonly id: string };

/** The segment's last answer is still streaming; a follow-up resumes its session, so it waits. */
export type AskBusy = { readonly kind: 'busy' };

/**
 * Sends one message in the member's Trợ lý thread. `ask_in_thread` picks the segment by the database's clock, and the
 * question id keys the message, so a second tap adds nothing. A message with a topic starts its own segment (P5-13).
 */
export const askQuestion = defineOp<AskInput, AskInput, Asked, AskBusy>({
  creates: 'conversations',
  input: inputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('messages').select('conversation_id').eq('household_id', ctx.householdId).eq('id', input.questionId).eq('role', 'user').maybeSingle();
    if (error) throw new Error(`Reading the question failed: ${error.message}`);
    return data === null ? change(input) : unchanged({ id: data.conversation_id });
  },
  async apply(ctx, { questionId, question, deep, topic }) {
    const { data, error } = await ctx.db.rpc('ask_in_thread', {
      p_household_id: ctx.householdId,
      p_question_id: questionId,
      p_question: question,
      p_deep: deep,
      ...(topic === null ? {} : { p_topic: topicPayload(topic) }),
    });
    if (error) return refuse(dbRefusal<AskBusy>(error, { ESTA_ASK_BUSY: { kind: 'busy' } }));
    return { ok: true, value: { id: data } };
  },
});
