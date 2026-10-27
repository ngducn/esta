import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

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
    const stillOpen = inboxStatus.safeParse(await storedStatus(ctx, id)).success;
    return refuse({ kind: stillOpen ? 'forbidden' : 'conflict' });
  },
});

const retryInput = z.strictObject({ id: idSchema });
type RetryInput = z.output<typeof retryInput>;

const RETRY_SENTINELS = {
  ESTA_RETRY_NOT_FOUND: { kind: 'not_found' },
  ESTA_RETRY_NOT_FAILED: { kind: 'conflict' },
} as const;

/**
 * Thử lại on a failed job's item (AGENT.md §9). `retry_agent_job` checks in SQL that the member is an admin, queues the
 * job again keyed `{key}:retry:{n}` and marks the item done, so a second tap queues nothing.
 */
export const agentJobRetry = defineOp<RetryInput, RetryInput, AgentItemSaved>({
  creates: null,
  input: retryInput,
  async plan(ctx, input) {
    const current = await storedStatus(ctx, input.id);
    if (current === null) return refuse({ kind: 'not_found' });
    if (current === 'done') return unchanged({ id: input.id });
    if (current !== 'new' && current !== 'read') return refuse({ kind: 'conflict' });
    return change(input);
  },
  async apply(ctx, { id }) {
    const { error } = await ctx.db.rpc('retry_agent_job', { p_item_id: id });
    if (error) return refuse(dbRefusal(error, RETRY_SENTINELS));
    return { ok: true, value: { id } };
  },
});
