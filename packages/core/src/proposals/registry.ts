import { z } from 'zod';
import type { Result } from '../result';
import { isoDateSchema } from '../schemas/legal';

/** [app rule] The `tasks.title` check. */
export const TASK_TITLE_MAX = 200;

const createTask = z.strictObject({
  title: z.string().trim().min(1).max(TASK_TITLE_MAX),
  due_on: isoDateSchema.nullable().default(null),
  property_id: z.uuid().nullable().default(null),
  lease_id: z.uuid().nullable().default(null),
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
 * What the assistant may propose (AGENT.md §4). `create_proposal` parses params with these schemas, and the approval
 * parses the stored params again, so a proposal whose shape no longer holds fails instead of running.
 */
export const PROPOSAL_TYPES = {
  create_task: { params: createTask, confirm: 'none', texts: ['title'] },
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
  return { ok: true, value: { type, params: parsed.data } };
}
