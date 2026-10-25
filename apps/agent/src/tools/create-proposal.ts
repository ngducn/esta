import { estaUri } from '@esta/core/links';
import { parseProposal, PROPOSAL_TYPES, isProposalType, type Proposal } from '@esta/core/proposals';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { guardedWriter, type NoteBinding } from './create-item';
import { ToolRejection } from './server';

export type ProposalBinding = Pick<NoteBinding, 'db' | 'householdId' | 'jobId' | 'locale' | 'sheet' | 'clock'>;

const inputSchema = z.object({ type: z.string(), params: z.record(z.string(), z.unknown()), rationale: z.string() });

const rejected = (lines: readonly string[]) => new ToolRejection(`${lines.join('\n')}\nFix these and call create_proposal again.`);

/** The records a proposal is about, as the `esta://` links its item relates. */
function subjects({ params }: Proposal): string[] {
  const property = 'property_id' in params ? params.property_id : null;
  return [property === null ? null : estaUri({ type: 'property', id: property }), params.lease_id === null ? null : estaUri({ type: 'lease', id: params.lease_id })].filter(
    (link) => link !== null,
  );
}

/** What `public.proposal_refusal` answers, as the line the model reads to fix its call. */
const REFUSALS: Readonly<Record<string, string>> = {
  ESTA_PROPOSAL_PARAMS: 'params: do not match the type',
  ESTA_PROPOSAL_SUBJECT: 'property_id, lease_id: not a record of this household, archived, or a lease of another property. Use ids a tool returned in this run.',
  ESTA_LEASE_NOT_ACTIVE: 'lease_id: the lease is not active',
  ESTA_REMINDER_NOTHING_OWED: 'lease_id: nothing is owed on this lease',
  ESTA_AMENDMENT_NOT_AFTER_AS_OF: 'effective_period_start: must be after today',
  ESTA_AMENDMENT_ALREADY_BILLED: 'effective_period_start: that period is already billed or paid; use a later period start',
  ESTA_AMENDMENT_DUPLICATE: 'effective_period_start: the lease already changes on that date',
  ESTA_AMENDMENT_NOT_A_PERIOD_START: 'effective_period_start: not a period start of this lease',
  ESTA_LEASE_NOT_RENEWABLE: 'lease_id: only an active or ended lease renews',
  ESTA_LEASE_OPEN_ENDED: 'lease_id: an open-ended lease has no end to renew from',
  ESTA_LEASE_ALREADY_RENEWED: 'lease_id: the lease already has a renewal',
  ESTA_RENEWAL_END: 'end_date: must be after the lease ends',
};

/** The same proposal twice is one item: the key hashes the type and the params as Esta stores them. */
const dedupeKey = (proposal: Proposal) => `proposal:${proposal.type}:${createHash('sha256').update(JSON.stringify(proposal.params)).digest('hex').slice(0, 32)}`;

/**
 * `create_proposal` (AGENT.md §4): an `agent_items` row of kind `proposal` that waits for a member's approval. Unknown
 * types and params the registry refuses go back to the model; the text params and the rationale pass the number guard
 * through the same writer as create_item before anything is stored.
 */
export function proposalWriter(binding: ProposalBinding) {
  const guard = guardedWriter(binding, 'create_proposal');

  async function write(raw: Record<string, unknown>): Promise<{ saved: true; added: boolean; dedupe_key: string }> {
    const input = inputSchema.safeParse(raw);
    if (!input.success) throw rejected(input.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
    const { type, params, rationale } = input.data;
    if (!isProposalType(type)) throw rejected([`type: ${JSON.stringify(type)} is not a proposal type; use one of ${Object.keys(PROPOSAL_TYPES).join(', ')}`]);

    const texts = PROPOSAL_TYPES[type].texts.flatMap((key) => {
      const template = params[key];
      return typeof template === 'string' ? [{ key, template }] : [];
    });
    const filled = await guard.fill(
      [...texts.map(({ template }) => ({ template, format: 'plain' as const })), { template: rationale, format: 'markdown' as const }],
      JSON.stringify(raw, null, 2),
    );
    const body = filled.at(-1)?.text ?? '';
    const parsed = parseProposal({ type, params: { ...params, ...Object.fromEntries(texts.map(({ key }, i) => [key, filled[i]?.text])) } });
    if (!parsed.ok) throw rejected(parsed.reason);
    const proposal = parsed.value;

    const today = (await binding.clock()).today();
    if (proposal.type === 'create_task' && proposal.params.due_on !== null && proposal.params.due_on < today) throw rejected([`params.due_on: before today, ${today}`]);
    const { data: refusal, error } = await binding.db.rpc('proposal_refusal', { p_household_id: binding.householdId, p_proposal: proposal });
    if (error) throw new Error(`Checking the proposal failed: ${error.message}`);
    if (refusal !== null) throw rejected([REFUSALS[refusal] ?? refusal]);

    const links = subjects(proposal);
    const key = dedupeKey(proposal);
    const added = await guard.save({ kind: 'proposal', severity: 'info', title: proposal.params.title, body_md: body, related: { links }, proposal, dedupe_key: key });
    return { saved: true, added, dedupe_key: key };
  }

  return { write };
}
