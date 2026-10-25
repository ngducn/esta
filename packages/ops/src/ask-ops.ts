import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged } from './op';

export const MAX_QUESTION_LENGTH = 2000;

const inputSchema = z.strictObject({ id: idSchema, questionId: idSchema, question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH), deep: z.boolean().default(false) });
type AskInput = z.output<typeof inputSchema>;

export type Asked = { readonly id: string };

/** The conversation's last answer is still streaming; a follow-up resumes its session, so it waits. */
export type AskBusy = { readonly kind: 'busy' };

/** Asks a first question or a follow-up; the question id keys the message, so a second tap adds nothing. */
export const askQuestion = defineOp<AskInput, AskInput, Asked, AskBusy>({
  creates: 'conversations',
  input: inputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('messages').select('id').eq('household_id', ctx.householdId).eq('conversation_id', input.id).eq('id', input.questionId).maybeSingle();
    if (error) throw new Error(`Reading the question failed: ${error.message}`);
    return data === null ? change(input) : unchanged({ id: input.id });
  },
  async apply(ctx, { id, questionId, question, deep }) {
    const { data, error } = await ctx.db.rpc('ask_question', { p_household_id: ctx.householdId, p_conversation_id: id, p_question_id: questionId, p_question: question, p_deep: deep, p_as_of: ctx.clock.now() });
    if (error) return refuse(dbRefusal<AskBusy>(error, { ESTA_ASK_BUSY: { kind: 'busy' } }));
    return { ok: true, value: { id: data } };
  },
});
