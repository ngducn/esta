import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged } from './op';

export const MAX_QUESTION_LENGTH = 2000;

const inputSchema = z.strictObject({ id: idSchema, question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH) });
type AskInput = z.output<typeof inputSchema>;

export type Asked = { readonly id: string };

/**
 * Hỏi (AGENT.md §5.6): a question in a new conversation whose id the caller mints, so a second tap lands on the same
 * conversation. `ask_question` writes the conversation, the question, the answer row and the ask job in one
 * transaction; a viewer may ask.
 */
export const askQuestion = defineOp<AskInput, AskInput, Asked>({
  creates: 'conversations',
  input: inputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('conversations').select('id').eq('household_id', ctx.householdId).eq('id', input.id).maybeSingle();
    if (error) throw new Error(`Reading the conversation failed: ${error.message}`);
    return data === null ? change(input) : unchanged({ id: data.id });
  },
  async apply(ctx, { id, question }) {
    const { data, error } = await ctx.db.rpc('ask_question', { p_household_id: ctx.householdId, p_conversation_id: id, p_question: question, p_as_of: ctx.clock.now() });
    if (error) return refuse(dbRefusal(error));
    return { ok: true, value: { id: data } };
  },
});
