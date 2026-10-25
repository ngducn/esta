import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const inputSchema = z.strictObject({ id: idSchema, status: z.enum(['open', 'done']) });
type TaskStatusInput = z.output<typeof inputSchema>;

export type TaskSaved = { readonly id: string };

async function storedStatus(ctx: OpContext, id: string): Promise<string | null> {
  const { data, error } = await ctx.db.from('tasks').select('status').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the task failed: ${error.message}`);
  return data?.status ?? null;
}

/** `Xong` and its undo: a task moves between open and done. */
export const taskSetStatus = defineOp<TaskStatusInput, TaskStatusInput, TaskSaved>({
  creates: null,
  input: inputSchema,
  async plan(ctx, input) {
    const current = await storedStatus(ctx, input.id);
    if (current === null) return refuse({ kind: 'not_found' });
    return current === input.status ? unchanged({ id: input.id }) : change(input);
  },
  async apply(ctx, { id, status }) {
    const { data, error } = await ctx.db.from('tasks').update({ status }).eq('household_id', ctx.householdId).eq('id', id).select('id');
    if (error) return refuse(dbRefusal(error));
    return data.length > 0 ? { ok: true, value: { id } } : refuse({ kind: 'forbidden' });
  },
});
