import type { Locale } from '../format';
import { displayTyped } from './display';
import { CALC_OPS, divRoundHalfAway, loanPaymentExact } from './ops';
import type { CalcRefusal, CalcResult, TypedKind, TypedValue } from './types';

export { CALC_OPS, divRoundHalfAway, loanPaymentExact, displayTyped };
export type { CalcOp, CalcOutput, CalcRefusal, CalcResult, TypedKind, TypedValue } from './types';

export function calcOp(id: string) {
  return CALC_OPS.find((op) => op.id === id);
}

function kindMismatch(expected: readonly TypedKind[], variadic: boolean, operands: readonly TypedValue[]): CalcRefusal | null {
  const last = expected.length - 1;
  const fits = variadic ? operands.length >= expected.length : operands.length === expected.length;
  if (!fits) return { kind: 'arity', expected: expected.length, got: operands.length };
  for (const [index, operand] of operands.entries()) {
    const want = expected[Math.min(index, last)];
    if (want !== undefined && operand.kind !== want) return { kind: 'wrong_kind', index, expected: want, got: operand.kind };
  }
  return null;
}

/** Runs one registered operation over already-typed operands; `result_display` and `working_display` are what the answer cites. */
export function calculate(id: string, operands: readonly TypedValue[], locale: Locale = 'vi'): CalcResult {
  const op = calcOp(id);
  if (op === undefined) return { ok: false, reason: { kind: 'unknown_op' } };
  const refusal = kindMismatch(op.operands, op.variadic === true, operands);
  if (refusal !== null) return { ok: false, reason: refusal };
  const ran = op.run(operands, locale);
  if (!ran.ok) return ran;
  return { ok: true, value: { value: ran.value.value, result_display: displayTyped(ran.value.value, locale), working_display: ran.value.working } };
}
