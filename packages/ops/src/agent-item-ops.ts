import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

/** The statuses a member moves an inbox note between; `new` exists so `Hoàn tác` can put an unread note back. */
export const INBOX_STATUSES = ['new', 'read', 'dismissed'] as const;
const inboxStatus = z.enum(INBOX_STATUSES);

const inputSchema = z.strictObject({ id: idSchema, status: inboxStatus });
type StatusInput = z.output<typeof inputSchema>;

export type AgentItemSaved = { readonly id: string };

async function storedStatus(ctx: OpContext, id: string): Promise<string | null> {
  const { data, error } = await ctx.db.from('agent_items').select('status').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the assistant item failed: ${error.message}`);
  return data?.status ?? null;
}

/**
 * Marks a note read, hides it, or undoes either. RLS hides an operator note from a member, so it reads as missing. An
 * item the household already decided (approved, done, failed) is never reopened from the inbox.
 */
export const agentItemSetStatus = defineOp<StatusInput, StatusInput, AgentItemSaved>({
  creates: null,
  input: inputSchema,
  async plan(ctx, input) {
    const current = await storedStatus(ctx, input.id);
    if (current === null) return refuse({ kind: 'not_found' });
    if (current === input.status) return unchanged({ id: input.id });
    if (!inboxStatus.safeParse(current).success) return refuse({ kind: 'invalid', issues: [{ path: 'status', code: 'decided' }] });
    return change(input);
  },
  async apply(ctx, { id, status }) {
    const { data, error } = await ctx.db
      .from('agent_items')
      .update({ status })
      .eq('household_id', ctx.householdId)
      .eq('id', id)
      .in('status', INBOX_STATUSES)
      .select('id');
    if (error) return refuse(dbRefusal(error));
    if (data.length > 0) return { ok: true, value: { id } };
    // A row decided since the plan is a conflict, which plans again to say so; one still open was blocked by RLS.
    return inboxStatus.safeParse(await storedStatus(ctx, id)).success ? refuse({ kind: 'forbidden' }) : refuse({ kind: 'conflict' });
  },
});
