import { reduceNationalIds } from '@esta/core/agent-schemas';
import type { Result } from '@esta/core/result';
import type { Json } from '@esta/db';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { leaseActivate } from './activation-op';
import { documentAttach } from './document-attach';
import type { LocalContext } from './files';
import { idSchema, invalid, type Refusal } from './kit';
import { leaseCreate, leaseEdit } from './lease-ops';
import { refuse, settle, type Op, type OpContext } from './op';
import { personCreate } from './person-ops';
import { propertyCreate, propertyEdit } from './property-ops';
import { addLabel, blockedBy, refLabelSchema, resolveRefs, type Label } from './refs';
import { unitCreate } from './unit-ops';
import { NO_PENDING, withWrites, type Pending, type Write } from './view';

export const PLAN_TTL_MINUTES = 30;
/** An apply that has held its claim this long died mid-batch, and the next apply finishes the batch. */
export const CLAIM_LEASE_MINUTES = 5;
export const MAX_ITEMS = 200;
export const MAX_BATCHES_PER_HOUR = 20;

export type ItemPlan =
  | { readonly status: 'change'; readonly change: Json; readonly preview?: Json }
  | { readonly status: 'unchanged'; readonly current: Json }
  | { readonly status: 'refused'; readonly refusal: Refusal };

export type ItemOutcome =
  | { readonly status: 'landed'; readonly output: Json }
  | { readonly status: 'unchanged'; readonly current: Json }
  | { readonly status: 'refused'; readonly refusal: Refusal };

type Stepped = { readonly plan: ItemPlan; readonly writes: readonly Write[] };

/** Each op as a batch sees it, JSON in and JSON out, with the op's own types closed over. */
type Step = {
  readonly creates: boolean;
  plan(ctx: LocalContext, raw: unknown): Promise<Stepped>;
  settle(ctx: LocalContext, raw: unknown, approved: unknown): Promise<ItemOutcome>;
};

const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null));
const refused = (refusal: Refusal): Stepped => ({ plan: { status: 'refused', refusal }, writes: [] });

function batchStep<I, C, O, R extends Refusal>(op: Op<I, C, O, R, LocalContext>): Step {
  return {
    creates: op.creates !== null,
    async plan(ctx, raw) {
      const input = op.input.safeParse(raw);
      if (!input.success) return refused(invalid(input.error));
      const planned = await op.plan(ctx, input.data);
      if (!planned.ok) return refused(planned.reason);
      const { value } = planned;
      if (value.kind === 'unchanged') return { plan: { status: 'unchanged', current: asJson(value.current) }, writes: [] };
      const preview = await op.preview?.(ctx, value.change);
      return { plan: { status: 'change', change: asJson(value.change), ...(preview === undefined ? {} : { preview }) }, writes: op.writes?.(value.change) ?? [] };
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
      // An approved change the database already holds landed, here or in an apply that died before recording it.
      return settled.value.landed || approved !== null ? { status: 'landed', output } : { status: 'unchanged', current: output };
    },
  };
}

export const OP_KINDS = ['property.create', 'property.edit', 'document.attach', 'unit.create', 'person.create', 'lease.create', 'lease.edit', 'lease.activate'] as const;
export type OpKind = (typeof OP_KINDS)[number];

/** The one list of what a batch can hold; `satisfies` fails the build when it and `OP_KINDS` disagree. */
const OPS = {
  'property.create': batchStep(propertyCreate),
  'property.edit': batchStep(propertyEdit),
  'document.attach': batchStep(documentAttach),
  'unit.create': batchStep(unitCreate),
  'person.create': batchStep(personCreate),
  'lease.create': batchStep(leaseCreate),
  'lease.edit': batchStep(leaseEdit),
  'lease.activate': batchStep(leaseActivate),
} as const satisfies Record<OpKind, Step>;

export const planRequestSchema = z.strictObject({
  summary: z.string().trim().min(1).max(300),
  items: z.array(z.strictObject({ op: z.enum(OP_KINDS), ref: refLabelSchema.optional(), input: z.unknown() })).min(1).max(MAX_ITEMS),
});
export type PlanRequest = z.output<typeof planRequestSchema>;

/**
 * `change` is what Ryan approved, null when the item had nothing to change. It is compared at apply, never written.
 * A plan stored before refs has no `needs`.
 */
const storedPlanSchema = z.object({
  v: z.literal(1),
  items: z.array(
    z.object({ op: z.enum(OP_KINDS), id: idSchema.nullable(), needs: z.array(z.number().int().nonnegative()).default([]), input: z.unknown(), change: z.unknown() }),
  ),
});
type StoredItem = z.output<typeof storedPlanSchema>['items'][number];

export type Reported<T> = T & { readonly index: number; readonly op: OpKind; readonly id: string | null };
export type PlannedBatch = { readonly planId: string; readonly expiresAt: string; readonly items: readonly Reported<ItemPlan>[] };
export type PlanRefusal = { readonly kind: 'items_refused'; readonly items: readonly Reported<ItemPlan>[] } | { readonly kind: 'rate_limited' };
export type AppliedBatch = { readonly planId: string; readonly status: 'applied' | 'partial'; readonly items: readonly Reported<ItemOutcome>[] };
export type ApplyRefusal =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'expired'; readonly expiredAt: string }
  | { readonly kind: 'in_progress'; readonly retryAt: string }
  | { readonly kind: 'already_applied'; readonly status: string };

const minutesFrom = (instant: string, minutes: number) => new Date(Date.parse(instant) + minutes * 60_000).toISOString();

/**
 * Keeps only the last four digits of any national ID number Ryan typed in chat (SPEC D11). References are set aside
 * first and kept whole: ids, since a uuid whose last group is twelve digits reads as an ID number, and file paths, since
 * a cut path names another file. The import folders refuse a path that holds an ID number, so no plan stores one.
 */
export function reduceTypedIds(raw: unknown): unknown {
  const kept: string[] = [];
  const reference = (key: string, value: string) => key === 'path' || idSchema.safeParse(value).success;
  const masked = JSON.parse(JSON.stringify(raw ?? null), (key, value: unknown) => (typeof value === 'string' && reference(key, value) ? `\u0000${kept.push(value) - 1}` : value));
  const reduced: unknown = reduceNationalIds(masked);
  return JSON.parse(JSON.stringify(reduced), (_key, value: unknown) => (typeof value === 'string' && value.startsWith('\u0000') ? kept[Number(value.slice(1))] : value));
}

function withId(raw: unknown, id: string | null): unknown {
  return id !== null && typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...raw, id } : raw;
}

function prepare(item: PlanRequest['items'][number], index: number, id: string | null, labels: Map<string, Label>, earlier: readonly Reported<ItemPlan>[]) {
  const typed = reduceTypedIds(item.input);
  const resolved = resolveRefs(typed, labels);
  // After resolving, so a self ref is unknown; before planning, so an item naming a refused one reads blocked.
  const labelled = addLabel(labels, item.ref, { index, id });
  if (!resolved.ok) return { input: typed, needs: [], refusal: resolved.reason };
  const { input, needs } = resolved.value;
  return { input: withId(input, id), needs, refusal: labelled ?? blockedBy(needs, earlier) };
}

/**
 * Plans every item in order and stores the batch only when none was refused, so Ryan's OK covers all of it. A create
 * gets its id here; Claude never invents one.
 */
export async function planChanges(ctx: LocalContext, request: PlanRequest): Promise<Result<PlannedBatch, PlanRefusal>> {
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
  const labels = new Map<string, Label>();
  let pending: Pending = NO_PENDING;
  for (const [index, item] of request.items.entries()) {
    const step = OPS[item.op];
    const id = step.creates ? randomUUID() : null;
    const { input, needs, refusal } = prepare(item, index, id, labels, items);
    const { plan, writes } = refusal === null ? await step.plan({ ...ctx, pending }, input) : refused(refusal);
    pending = withWrites(pending, writes);
    items.push({ ...plan, index, op: item.op, id });
    stored.push({ op: item.op, id, needs: [...needs], input, change: plan.status === 'change' ? plan.change : null });
  }
  if (items.some((item) => item.status === 'refused')) return refuse({ kind: 'items_refused', items });

  const summary = z.string().parse(reduceTypedIds(request.summary));
  const { data, error: insertError } = await ctx.db
    .from('change_batches')
    .insert({ household_id: ctx.householdId, summary, plan: asJson({ v: 1, items: stored }), planned_at: now })
    .select('id')
    .single();
  if (insertError) throw new Error(`Storing the plan failed: ${insertError.message}`);
  return { ok: true, value: { planId: data.id, expiresAt: minutesFrom(now, PLAN_TTL_MINUTES), items } };
}

/** Why a batch could not be claimed, read after the claim found nothing. */
async function unclaimable(ctx: OpContext, planId: string): Promise<ApplyRefusal> {
  const { data, error } = await ctx.db.from('change_batches').select('status, planned_at, applied_at').eq('household_id', ctx.householdId).eq('id', planId).maybeSingle();
  if (error) throw new Error(`Reading the plan failed: ${error.message}`);
  if (data === null) return { kind: 'not_found' };
  if (data.status === 'planned') return { kind: 'expired', expiredAt: minutesFrom(data.planned_at, PLAN_TTL_MINUTES) };
  if (data.status === 'applying' && data.applied_at !== null) return { kind: 'in_progress', retryAt: minutesFrom(data.applied_at, CLAIM_LEASE_MINUTES) };
  return { kind: 'already_applied', status: data.status };
}

/**
 * Takes the batch for this apply and returns its plan: a plan still fresh, or a claim held past the lease by an apply
 * that died. Each is one conditional update, so of two applies racing for the batch only one takes it.
 */
async function claim(ctx: OpContext, planId: string, now: string): Promise<Json | null> {
  const take = () => ctx.db.from('change_batches').update({ status: 'applying', applied_at: now }).eq('household_id', ctx.householdId).eq('id', planId);
  const fresh = await take().eq('status', 'planned').gt('planned_at', minutesFrom(now, -PLAN_TTL_MINUTES)).select('plan').maybeSingle();
  if (fresh.error) throw new Error(`Claiming the plan failed: ${fresh.error.message}`);
  if (fresh.data !== null) return fresh.data.plan;
  const abandoned = await take().eq('status', 'applying').lte('applied_at', minutesFrom(now, -CLAIM_LEASE_MINUTES)).select('plan').maybeSingle();
  if (abandoned.error) throw new Error(`Taking over the plan failed: ${abandoned.error.message}`);
  return abandoned.data?.plan ?? null;
}

const failed: ItemOutcome = { status: 'refused', refusal: { kind: 'failed' } };

/**
 * Claims the batch, then for each item parses the stored input again, plans again, and applies only when the fresh
 * change equals the one Ryan approved. An item that throws is `failed` and the rest go on. When an apply dies before
 * recording the outcomes, the next one after the lease plans every item again: what already landed plans as unchanged
 * and counts as landed, and the rest apply.
 */
export async function applyPlan(ctx: LocalContext, planId: string): Promise<Result<AppliedBatch, ApplyRefusal>> {
  const claimed = await claim(ctx, planId, ctx.clock.now());
  if (claimed === null) return refuse(await unclaimable(ctx, planId));

  const plan = storedPlanSchema.parse(claimed);
  const items: Reported<ItemOutcome>[] = [];
  for (const [index, item] of plan.items.entries()) {
    const blocked = blockedBy(item.needs, items);
    const outcome: ItemOutcome = blocked === null ? await OPS[item.op].settle(ctx, item.input, item.change).catch(() => failed) : { status: 'refused', refusal: blocked };
    items.push({ ...outcome, index, op: item.op, id: item.id });
  }
  const status = items.every((item) => item.status !== 'refused') ? 'applied' : 'partial';
  const { data: finished, error } = await ctx.db
    .from('change_batches')
    .update({ status, outcomes: asJson(items) })
    .eq('household_id', ctx.householdId)
    .eq('id', planId)
    .eq('status', 'applying')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Recording what landed failed: ${error.message}`);
  if (finished === null) return refuse(await unclaimable(ctx, planId));
  return { ok: true, value: { planId, status, items } };
}
