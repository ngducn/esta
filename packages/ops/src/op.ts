import type { Clock } from '@esta/core';
import type { Result } from '@esta/core/result';
import type { Database } from '@esta/db';
import type { z } from 'zod';
import type { Db } from './db';
import { invalid, type CommonRefusal, type Refusal } from './kit';

export type OpContext = { readonly db: Db; readonly householdId: string; readonly clock: Clock };

/** The change to approve, or nothing to do because the database already holds what the input asks for. */
export type Planned<C, O> = { readonly kind: 'change'; readonly change: C } | { readonly kind: 'unchanged'; readonly current: O };

/**
 * One write Esta performs (CONNECTOR.md §3.1). `input` names the state the row should reach, with any new row's id
 * minted by the caller. `plan` only reads; planning twice on an untouched database gives equal changes, and planning
 * after `apply` gives `unchanged`. `apply` writes exactly the change through one statement or one definer function.
 */
export type Op<I, C, O, R extends Refusal> = {
  readonly creates: keyof Database['public']['Tables'] | null;
  readonly input: z.ZodType<I, unknown>;
  plan(ctx: OpContext, input: I): Promise<Result<Planned<C, O>, R | CommonRefusal>>;
  apply(ctx: OpContext, change: C): Promise<Result<O, R | CommonRefusal>>;
};

export function defineOp<I, C, O, R extends Refusal = never>(op: Op<I, C, O, R>): Op<I, C, O, R> {
  return op;
}

export const change = <C>(value: C): Result<Planned<C, never>, never> => ({ ok: true, value: { kind: 'change', change: value } });
export const unchanged = <O>(current: O): Result<Planned<never, O>, never> => ({ ok: true, value: { kind: 'unchanged', current } });
export const refuse = <R extends Refusal>(reason: R): Result<never, R> => ({ ok: false, reason });

export type Settled<O> = { readonly landed: boolean; readonly output: O };

/**
 * Plans, lets `approve` veto the fresh change, then applies it. A conflict at apply is explained by planning once
 * more: the plan already knows how to say "code Q7 belongs to Nhà Q1", or that the row now exists.
 */
export async function settle<I, C, O, R extends Refusal, V extends Refusal>(
  op: Op<I, C, O, R>,
  ctx: OpContext,
  input: I,
  approve: (change: C) => V | null,
): Promise<Result<Settled<O>, R | CommonRefusal | V>> {
  const planned = await op.plan(ctx, input);
  if (!planned.ok) return planned;
  if (planned.value.kind === 'unchanged') return { ok: true, value: { landed: false, output: planned.value.current } };
  const veto = approve(planned.value.change);
  if (veto !== null) return refuse(veto);
  const applied = await op.apply(ctx, planned.value.change);
  if (applied.ok) return { ok: true, value: { landed: true, output: applied.value } };
  if (applied.reason.kind !== 'conflict') return applied;
  const explained = await op.plan(ctx, input);
  if (!explained.ok) return explained;
  return explained.value.kind === 'unchanged' ? { ok: true, value: { landed: false, output: explained.value.current } } : applied;
}

/** Parse, plan and apply at once, for a caller that acts now: every server action. */
export async function runOp<I, C, O, R extends Refusal>(op: Op<I, C, O, R>, ctx: OpContext, raw: unknown): Promise<Result<O, R | CommonRefusal>> {
  const input = op.input.safeParse(raw);
  if (!input.success) return refuse(invalid(input.error));
  const settled = await settle<I, C, O, R, never>(op, ctx, input.data, () => null);
  return settled.ok ? { ok: true, value: settled.value.output } : settled;
}
