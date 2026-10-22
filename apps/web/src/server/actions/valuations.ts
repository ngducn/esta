'use server';

import type { Result } from '@esta/core/result';
import { readValuation, type ValuationProblems } from '@esta/core/valuations';
import { runOp, valuationCreate, valuationDelete } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type ValuationRefusal = { readonly kind: 'fields'; readonly problems: ValuationProblems } | { readonly kind: 'forbidden' | 'failed' };

function revalidateValuations() {
  revalidatePath('/properties', 'layout');
  revalidatePath('/');
}

/**
 * `Lưu` on the valuation sheet, and `Hoàn tác` after a delete, which sends the deleted row back under its id (FIN-5).
 * The fields are read against the request's Clock day, each refused on its own field.
 */
export async function createValuation(raw: unknown): Promise<Result<undefined, ValuationRefusal>> {
  const ctx = await webOpContext();
  const read = readValuation(raw, ctx.clock.today());
  if (!read.ok) return { ok: false, reason: { kind: 'fields', problems: read.reason } };
  const saved = await runOp(valuationCreate, ctx, read.value);
  if (!saved.ok) return { ok: false, reason: { kind: saved.reason.kind === 'forbidden' ? 'forbidden' : 'failed' } };
  revalidateValuations();
  return { ok: true, value: undefined };
}

export async function deleteValuation(raw: unknown): Promise<Result<undefined, ValuationRefusal>> {
  const removed = await runOp(valuationDelete, await webOpContext(), raw);
  if (!removed.ok) return { ok: false, reason: { kind: removed.reason.kind === 'forbidden' ? 'forbidden' : 'failed' } };
  revalidateValuations();
  return { ok: true, value: undefined };
}
