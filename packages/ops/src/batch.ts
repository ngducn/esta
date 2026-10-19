import { reduceNationalIds } from '@esta/core/agent-schemas';
import type { Result } from '@esta/core/result';
import type { Json } from '@esta/db';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { idSchema, invalid, type Refusal } from './kit';
import { refuse, settle, type Op, type OpContext } from './op';
import { propertyCreate, propertyEdit } from './property-ops';

export const PLAN_TTL_MINUTES = 30;
export const MAX_ITEMS = 200;
export const MAX_BATCHES_PER_HOUR = 20;

export type ItemPlan =
  | { readonly status: 'change'; readonly change: Json }
  | { readonly status: 'unchanged'; readonly current: Json }
  | { readonly status: 'refused'; readonly refusal: Refusal };

export type ItemOutcome =
  | { readonly status: 'landed'; readonly output: Json }
  | { readonly status: 'unchanged'; readonly current: Json }
  | { readonly status: 'refused'; readonly refusal: Refusal };

/** Each op as a batch sees it, JSON in and JSON out, with the op's own types closed over. */
type Step = {
  readonly creates: boolean;
  plan(ctx: OpContext, raw: unknown): Promise<ItemPlan>;
  settle(ctx: OpContext, raw: unknown, approved: unknown): Promise<ItemOutcome>;
};

const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null));

function batchStep<I, C, O, R extends Refusal>(op: Op<I, C, O, R>): Step {
  return {
    creates: op.creates !== null,
    async plan(ctx, raw) {
      const input = op.input.safeParse(raw);
      if (!input.success) return { status: 'refused', refusal: invalid(input.error) };
      const planned = await op.plan(ctx, input.data);
      if (!planned.ok) return { status: 'refused', refusal: planned.reason };
      return planned.value.kind === 'change'
        ? { status: 'change', change: asJson(planned.value.change) }
        : { status: 'unchanged', current: asJson(planned.value.current) };
    },
    async settle(ctx, raw, approved) {
      const input = op.input.safeParse(raw);
      if (!input.success) return { status: 'refused', refusal: { kind: 'stale' } };
      const settled = await settle(op, ctx, input.data, (fresh) => {
        const now = asJson(fresh);
        return isDeepStrictEqual(now, approved) ? null : { kind: 'stale', now };
      });
      if (!settled.ok) return { status: 'refused', refusal: settled.reason };
      const output = asJson(settled.value.output);
      return settled.value.landed ? { status: 'landed', output } : { status: 'unchanged', current: output };
    },
  };
}

export const OP_KINDS = ['property.create', 'property.edit'] as const;
export type OpKind = (typeof OP_KINDS)[number];

/** The one list of what a batch can hold; `satisfies` fails the build when it and `OP_KINDS` disagree. */
const OPS = {
  'property.create': batchStep(propertyCreate),
  'property.edit': batchStep(propertyEdit),
} as const satisfies Record<OpKind, Step>;

export const planRequestSchema = z.strictObject({
  summary: z.string().trim().min(1).max(300),
  items: z.array(z.strictObject({ op: z.enum(OP_KINDS), input: z.unknown() })).min(1).max(MAX_ITEMS),
});
export type PlanRequest = z.output<typeof planRequestSchema>;

/** `change` is what Ryan approved, null when the item had nothing to change. It is compared at apply, never written. */
const storedPlanSchema = z.object({
  v: z.literal(1),
  items: z.array(z.object({ op: z.enum(OP_KINDS), id: idSchema.nullable(), input: z.unknown(), change: z.unknown() })),
});
type StoredItem = z.output<typeof storedPlanSchema>['items'][number];

export type Reported<T> = T & { readonly index: number; readonly op: OpKind; readonly id: string | null };
export type PlannedBatch = { readonly planId: string; readonly expiresAt: string; readonly items: readonly Reported<ItemPlan>[] };
export type PlanRefusal = { readonly kind: 'items_refused'; readonly items: readonly Reported<ItemPlan>[] } | { readonly kind: 'rate_limited' };
export type AppliedBatch = { readonly planId: string; readonly status: 'applied' | 'partial'; readonly items: readonly Reported<ItemOutcome>[] };
export type ApplyRefusal =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'expired'; readonly expiredAt: string }
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'already_applied'; readonly status: string };

const minutesFrom = (instant: string, minutes: number) => new Date(Date.parse(instant) + minutes * 60_000).toISOString();

/**
 * Keeps only the last four digits of any national ID number Ryan typed in chat (SPEC D11). Ids are set aside first:
 * a uuid whose last group is twelve digits reads as an ID number.
 */
export function reduceTypedIds(raw: unknown): unknown {
  const ids: string[] = [];
  const masked = JSON.parse(JSON.stringify(raw ?? null), (_key, value: unknown) => (typeof value === 'string' && idSchema.safeParse(value).success ? `\u0000${ids.push(value) - 1}` : value));
  const reduced: unknown = reduceNationalIds(masked);
  return JSON.parse(JSON.stringify(reduced), (_key, value: unknown) => (typeof value === 'string' && value.startsWith('\u0000') ? ids[Number(value.slice(1))] : value));
}

function withId(raw: unknown, id: string): unknown {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...raw, id } : raw;
}

/**
 * Plans every item in order and stores the batch only when none was refused, so Ryan's OK covers all of it. A create
 * gets its id here; Claude never invents one.
 */
export async function planChanges(ctx: OpContext, request: PlanRequest): Promise<Result<PlannedBatch, PlanRefusal>> {
  const now = ctx.clock.now();
  const { count, error } = await ctx.db
    .from('change_batches')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', ctx.householdId)
    .gt('planned_at', minutesFrom(now, -60));
  if (error) throw new Error(`Counting recent batches failed: ${error.message}`);
  if ((count ?? 0) >= MAX_BATCHES_PER_HOUR) return refuse({ kind: 'rate_limited' });

  const items: Reported<ItemPlan>[] = [];
  const stored: StoredItem[] = [];
  for (const [index, item] of request.items.entries()) {
    const step = OPS[item.op];
    const id = step.creates ? randomUUID() : null;
    const typed = reduceTypedIds(item.input);
    const input = id === null ? typed : withId(typed, id);
    const planned = await step.plan(ctx, input);
    items.push({ ...planned, index, op: item.op, id });
    stored.push({ op: item.op, id, input, change: planned.status === 'change' ? planned.change : null });
  }
  if (items.some((item) => item.status === 'refused')) return refuse({ kind: 'items_refused', items });

  const { data, error: insertError } = await ctx.db
    .from('change_batches')
    .insert({ household_id: ctx.householdId, summary: request.summary, plan: asJson({ v: 1, items: stored }), planned_at: now })
    .select('id')
    .single();
  if (insertError) throw new Error(`Storing the plan failed: ${insertError.message}`);
  return { ok: true, value: { planId: data.id, expiresAt: minutesFrom(now, PLAN_TTL_MINUTES), items } };
}

/** Why a batch could not be claimed, read after the claim found nothing. */
async function unclaimable(ctx: OpContext, planId: string): Promise<ApplyRefusal> {
  const { data, error } = await ctx.db.from('change_batches').select('status, planned_at').eq('household_id', ctx.householdId).eq('id', planId).maybeSingle();
  if (error) throw new Error(`Reading the plan failed: ${error.message}`);
  if (data === null) return { kind: 'not_found' };
  if (data.status === 'planned') return { kind: 'expired', expiredAt: minutesFrom(data.planned_at, PLAN_TTL_MINUTES) };
  if (data.status === 'applying') return { kind: 'in_progress' };
  return { kind: 'already_applied', status: data.status };
}

/**
 * Claims the batch once, then for each item parses the stored input again, plans again, and applies only when the
 * fresh change equals the one Ryan approved. A batch left `applying` by a crash stays so (`in_progress`).
 */
export async function applyPlan(ctx: OpContext, planId: string): Promise<Result<AppliedBatch, ApplyRefusal>> {
  const now = ctx.clock.now();
  const { data: claimed, error } = await ctx.db
    .from('change_batches')
    .update({ status: 'applying', applied_at: now })
    .eq('household_id', ctx.householdId)
    .eq('id', planId)
    .eq('status', 'planned')
    .gt('planned_at', minutesFrom(now, -PLAN_TTL_MINUTES))
    .select('plan')
    .maybeSingle();
  if (error) throw new Error(`Claiming the plan failed: ${error.message}`);
  if (claimed === null) return refuse(await unclaimable(ctx, planId));

  const plan = storedPlanSchema.parse(claimed.plan);
  const items: Reported<ItemOutcome>[] = [];
  for (const [index, item] of plan.items.entries()) {
    const outcome = await OPS[item.op].settle(ctx, item.input, item.change);
    items.push({ ...outcome, index, op: item.op, id: item.id });
  }
  const status = items.every((item) => item.status !== 'refused') ? 'applied' : 'partial';
  const { error: finishError } = await ctx.db
    .from('change_batches')
    .update({ status, outcomes: asJson(items) })
    .eq('household_id', ctx.householdId)
    .eq('id', planId)
    .eq('status', 'applying');
  if (finishError) throw new Error(`Recording what landed failed: ${finishError.message}`);
  return { ok: true, value: { planId, status, items } };
}
