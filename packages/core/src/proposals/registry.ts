import { z } from 'zod';
import { RENEWAL_INCREASE_BPS } from '../lease/changes';
import { MAX_AMOUNT_VND } from '../money/vnd';
import type { Result } from '../result';
import { isoDateSchema } from '../schemas/legal';
import { vndSchema } from '../schemas/property';

/** [app rule] The `tasks.title` check. */
export const TASK_TITLE_MAX = 200;

const title = z.string().trim().min(1).max(TASK_TITLE_MAX);
const subject = z.uuid().nullable().default(null);

const createTask = z.strictObject({ title, due_on: isoDateSchema.nullable().default(null), property_id: subject, lease_id: subject });
const flagDataIssue = z.strictObject({ title, property_id: subject, lease_id: subject });
const draftReminder = z.strictObject({ title, lease_id: z.uuid() });
const suggestRentChange = z.strictObject({
  title,
  lease_id: z.uuid(),
  effective_period_start: isoDateSchema,
  rent_vnd: vndSchema.refine((amount) => amount > 0 && amount <= MAX_AMOUNT_VND),
});
const suggestLeaseRenewal = z.strictObject({
  title,
  lease_id: z.uuid(),
  increase_bps: z.number().int().min(RENEWAL_INCREASE_BPS.min).max(RENEWAL_INCREASE_BPS.max),
  end_date: isoDateSchema,
});

export type ProposalConfirm = 'none' | 'names_object';

type ProposalSpec = {
  readonly params: z.ZodType<Readonly<Record<string, unknown>>>;
  /** `names_object` asks Mẹ in words Esta writes from the params before the approval runs. */
  readonly confirm: ProposalConfirm;
  /** The params the model writes as text, which pass the number guard as plain text before they are stored. */
  readonly texts: readonly string[];
};

/**
 * What the assistant may propose (AGENT.md §4). `create_proposal` parses params with these schemas before it asks the
 * database (`private.proposal_params_ok`, the SQL twin of these shapes) whether the proposal applies; the approval asks
 * the database again, so a proposal whose shape or subject no longer holds fails instead of running.
 */
export const PROPOSAL_TYPES = {
  create_task: { params: createTask, confirm: 'none', texts: ['title'] },
  flag_data_issue: { params: flagDataIssue, confirm: 'none', texts: ['title'] },
  draft_reminder: { params: draftReminder, confirm: 'none', texts: ['title'] },
  suggest_rent_change: { params: suggestRentChange, confirm: 'names_object', texts: ['title'] },
  suggest_lease_renewal: { params: suggestLeaseRenewal, confirm: 'names_object', texts: ['title'] },
} as const satisfies Record<string, ProposalSpec>;

export type ProposalType = keyof typeof PROPOSAL_TYPES;

export type Proposal = { [T in ProposalType]: { readonly type: T; readonly params: z.output<(typeof PROPOSAL_TYPES)[T]['params']> } }[ProposalType];

export const isProposalType = (type: string): type is ProposalType => Object.hasOwn(PROPOSAL_TYPES, type);

const envelope = z.object({ type: z.string(), params: z.unknown() });

/** A stored or proposed `{ type, params }`, or one line per problem in the form `params.title: …`. */
export function parseProposal(raw: unknown): Result<Proposal, string[]> {
  const shape = envelope.safeParse(raw);
  if (!shape.success) return { ok: false, reason: ['(root): expected {"type", "params"}'] };
  const { type, params } = shape.data;
  if (!isProposalType(type)) return { ok: false, reason: [`type: ${JSON.stringify(type)} is not a proposal type; use one of ${Object.keys(PROPOSAL_TYPES).join(', ')}`] };
  const parsed = PROPOSAL_TYPES[type].params.safeParse(params);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((issue) => `${['params', ...issue.path].join('.')}: ${issue.message}`) };
  // TypeScript cannot tie `type` to the output of `PROPOSAL_TYPES[type]`; the schema lookup above is that tie.
  return { ok: true, value: { type, params: parsed.data } as Proposal };
}
