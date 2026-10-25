import { parseProposal } from '@esta/core/proposals';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const inputSchema = z.strictObject({ id: idSchema });
type ApproveInput = z.output<typeof inputSchema>;

const decidedSchema = z.enum(['approved', 'failed']);
export type ProposalDecided = { readonly id: string; readonly status: z.output<typeof decidedSchema> };
export type ProposalRefusal = { readonly kind: 'dismissed' };

const SENTINELS: Readonly<Record<string, ProposalRefusal | { readonly kind: 'not_found' }>> = {
  ESTA_PROPOSAL_NOT_FOUND: { kind: 'not_found' },
  ESTA_PROPOSAL_DECIDED: { kind: 'dismissed' },
};

async function storedProposal(ctx: OpContext, id: string) {
  const { data, error } = await ctx.db.from('agent_items').select('status, proposal').eq('household_id', ctx.householdId).eq('id', id).eq('kind', 'proposal').maybeSingle();
  if (error) throw new Error(`Reading the proposal failed: ${error.message}`);
  return data;
}

/**
 * Approves one proposal as the member (AGT-6). The plan parses the stored params with the registry again, and
 * `approve_proposal` writes the effect and the decision in one transaction, so approving twice converges on one effect.
 */
export const proposalApprove = defineOp<ApproveInput, { readonly id: string; readonly paramsValid: boolean }, ProposalDecided, ProposalRefusal>({
  creates: null,
  input: inputSchema,
  async plan(ctx, { id }) {
    const item = await storedProposal(ctx, id);
    if (item === null) return refuse({ kind: 'not_found' });
    const decided = decidedSchema.safeParse(item.status);
    if (decided.success) return unchanged({ id, status: decided.data });
    if (item.status !== 'new' && item.status !== 'read') return refuse({ kind: 'dismissed' });
    return change({ id, paramsValid: parseProposal(item.proposal).ok });
  },
  async apply(ctx, { id, paramsValid }) {
    const { data, error } = await ctx.db.rpc('approve_proposal', { p_item_id: id, p_params_valid: paramsValid });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    return { ok: true, value: { id, status: decidedSchema.parse(data) } };
  },
});
