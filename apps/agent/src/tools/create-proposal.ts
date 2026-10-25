import { estaUri, parseEstaUri, type EstaLinkType } from '@esta/core/links';
import { parseProposal, PROPOSAL_TYPES, isProposalType, type Proposal } from '@esta/core/proposals';
import { normalizeUrl } from '@esta/core/research';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { guardedWriter, type NoteBinding } from './create-item';
import { ToolRejection } from './server';

/**
 * A job that may cite sources (AGENT.md §5.5): each citation is a page WebFetch read in this run (`fetched`, by
 * normalized URL) or one of the household's stored research items. `most` caps the proposals of one run.
 */
export type Citing = { readonly fetched: ReadonlySet<string>; readonly most: number };

export type ProposalBinding = Pick<NoteBinding, 'db' | 'householdId' | 'jobId' | 'locale' | 'sheet' | 'clock'> & { readonly citing?: Citing };

const inputSchema = z.object({ type: z.string(), params: z.record(z.string(), z.unknown()), rationale: z.string(), citations: z.array(z.string()).max(5).optional() });

/** What `agent_items.citations` stores of one source. */
type Citation = { readonly url: string; readonly title: string | null; readonly source_name: string; readonly published_at: string | null };

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
  ESTA_PROPOSAL_SUBJECT: 'property_id, lease_id: not a record of this household, archived, or a lease of another property. Use the handles or ids a tool returned in this run.',
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
/** Each cited URL as the stored research item names it, or a page this run fetched; one line per URL that is neither. */
async function resolveCitations({ db, householdId, citing }: ProposalBinding, urls: readonly string[]): Promise<{ readonly found: Citation[]; readonly refused: string[] }> {
  if (urls.length === 0) return { found: [], refused: [] };
  const byKey = new Map(urls.map((url) => [url, normalizeUrl(url)] as const).map(([url, key]) => [key.ok ? key.value : url, { url, key }]));
  const normalized = [...byKey.values()];
  const keys = normalized.flatMap(({ key }) => (key.ok ? [key.value] : []));
  const { data, error } = await db.from('research_items').select('url_normalized, source_url, title_vi, source_name, published_on').eq('household_id', householdId).in('url_normalized', keys);
  if (error) throw new Error(`Reading the cited research items failed: ${error.message}`);
  const stored = new Map(data.map((row) => [row.url_normalized, row]));
  const found: Citation[] = [];
  const refused: string[] = [];
  for (const { url, key } of normalized) {
    const item = key.ok ? stored.get(key.value) : undefined;
    if (item !== undefined) found.push({ url: item.source_url, title: item.title_vi, source_name: item.source_name, published_at: item.published_on });
    else if (key.ok && citing?.fetched.has(key.value) === true) found.push({ url: key.value, title: null, source_name: new URL(key.value).hostname, published_at: null });
    else refused.push(`citations: ${JSON.stringify(url)} is not a page WebFetch read in this run or a research item recent_items returned`);
  }
  return { found, refused };
}

const SUBJECT_PARAMS: Readonly<Record<string, EstaLinkType>> = { property_id: 'property', lease_id: 'lease' };

/** A subject param may name a record by its handle, as `"lease_id": "f12"`, which becomes the id its link holds. */
function subjectIds(params: Readonly<Record<string, unknown>>, sheet: ProposalBinding['sheet']): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const link = typeof value === 'string' && Object.hasOwn(SUBJECT_PARAMS, key) ? sheet.get(value)?.link : undefined;
      const route = typeof link === 'string' ? parseEstaUri(link) : null;
      return [key, route?.ok === true && route.value.type === SUBJECT_PARAMS[key] ? route.value.id : value];
    }),
  );
}

const dedupeKey = (proposal: Proposal) => `proposal:${proposal.type}:${createHash('sha256').update(JSON.stringify(proposal.params)).digest('hex').slice(0, 32)}`;

/**
 * `create_proposal` (AGENT.md §4): an `agent_items` row of kind `proposal` that waits for a member's approval. Unknown
 * types and params the registry refuses go back to the model; the text params and the rationale pass the number guard
 * through the same writer as create_item before anything is stored.
 */
export function proposalWriter(binding: ProposalBinding) {
  const guard = guardedWriter(binding, 'create_proposal');
  const { citing } = binding;
  const saved: string[] = [];

  async function write(raw: Record<string, unknown>): Promise<{ saved: true; added: boolean; dedupe_key: string }> {
    const input = inputSchema.safeParse(raw);
    if (!input.success) throw rejected(input.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
    const { type, params, rationale, citations = [] } = input.data;
    if (citing !== undefined && saved.length >= citing.most) throw new ToolRejection(`This run already made ${citing.most} proposals, the most it may make. Do not call create_proposal again.`);
    if (!isProposalType(type)) throw rejected([`type: ${JSON.stringify(type)} is not a proposal type; use one of ${Object.keys(PROPOSAL_TYPES).join(', ')}`]);
    if (citing === undefined && citations.length > 0) throw rejected(['citations: this job cites no sources; leave citations out']);
    if (citing !== undefined && type === 'suggest_rent_change' && citations.length === 0) throw rejected(['citations: a rent change cites the market news it rests on, as URLs of pages WebFetch read in this run or research items recent_items returned']);

    const texts = PROPOSAL_TYPES[type].texts.flatMap((key) => {
      const template = params[key];
      return typeof template === 'string' ? [{ key, template }] : [];
    });
    const filled = await guard.fill(
      [...texts.map(({ template }) => ({ template, format: 'plain' as const })), { template: rationale, format: 'markdown' as const }],
      JSON.stringify(raw, null, 2),
    );
    const body = filled.at(-1)?.text ?? '';
    const parsed = parseProposal({ type, params: { ...subjectIds(params, binding.sheet), ...Object.fromEntries(texts.map(({ key }, i) => [key, filled[i]?.text])) } });
    if (!parsed.ok) throw rejected(parsed.reason);
    const proposal = parsed.value;

    const today = (await binding.clock()).today();
    if (proposal.type === 'create_task' && proposal.params.due_on !== null && proposal.params.due_on < today) throw rejected([`params.due_on: before today, ${today}`]);

    const sources = await resolveCitations(binding, citations);
    if (sources.refused.length > 0) throw rejected(sources.refused);
    const { data: refusal, error } = await binding.db.rpc('proposal_refusal', { p_household_id: binding.householdId, p_proposal: proposal });
    if (error) throw new Error(`Checking the proposal failed: ${error.message}`);
    if (refusal !== null) throw rejected([REFUSALS[refusal] ?? refusal]);

    const links = subjects(proposal);
    const key = dedupeKey(proposal);
    const added = await guard.save({ kind: 'proposal', severity: 'info', title: proposal.params.title, body_md: body, related: { links }, proposal, citations: sources.found, dedupe_key: key });
    saved.push(key);
    return { saved: true, added, dedupe_key: key };
  }

  return { write, saved: saved as readonly string[] };
}
