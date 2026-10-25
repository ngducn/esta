import { estaUri } from '@esta/core/links';
import { parseProposal, PROPOSAL_TYPES, isProposalType, type Proposal } from '@esta/core/proposals';
import { existingLinks } from '@esta/ops';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { guardedWriter, type NoteBinding } from './create-item';
import { ToolRejection } from './server';

export type ProposalBinding = Pick<NoteBinding, 'db' | 'householdId' | 'jobId' | 'locale' | 'sheet' | 'clock'>;

const inputSchema = z.object({ type: z.string(), params: z.record(z.string(), z.unknown()), rationale: z.string() });

const rejected = (lines: readonly string[]) => new ToolRejection(`${lines.join('\n')}\nFix these and call create_proposal again.`);

/** The records a proposal is about, as the `esta://` links its item relates. */
function subjects(proposal: Proposal): string[] {
  const { property_id, lease_id } = proposal.params;
  return [property_id === null ? null : estaUri({ type: 'property', id: property_id }), lease_id === null ? null : estaUri({ type: 'lease', id: lease_id })].filter(
    (link) => link !== null,
  );
}

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

    const links = subjects(proposal);
    const present = await existingLinks(binding.db, binding.householdId, links);
    const missing = links.filter((link) => !present.has(link));
    if (missing.length > 0) throw rejected([`${missing.join(', ')}: not a record of this household. Use an id a tool returned in this run.`]);

    const key = dedupeKey(proposal);
    const added = await guard.save({ kind: 'proposal', severity: 'info', title: proposal.params.title, body_md: body, related: { links }, proposal, dedupe_key: key });
    return { saved: true, added, dedupe_key: key };
  }

  return { write };
}
