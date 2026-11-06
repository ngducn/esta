import type { IsoDate } from '../date/iso-date';
import type { Locale } from '../format';
import type { Vnd } from '../money/vnd';
import type { Result } from '../result';

export type TypedValue =
  | { kind: 'vnd'; value: Vnd }
  /** `per: 'month'` marks a rate she wrote per month; a bare bp is a yearly rate or a share. */
  | { kind: 'bp'; value: number; per?: 'month' | undefined }
  | { kind: 'count'; value: number; unit: string }
  | { kind: 'months'; value: number }
  | { kind: 'date'; value: IsoDate };

export type TypedKind = TypedValue['kind'];

export type CalcRefusal =
  | { kind: 'arity'; expected: number; got: number }
  | { kind: 'wrong_kind'; index: number; expected: TypedKind; got: TypedKind }
  | { kind: 'unknown_op' }
  | { kind: 'overflow' }
  | { kind: 'invalid'; why: string };

export type CalcOutput = { value: TypedValue; result_display: string; working_display: string };

export type CalcOp = {
  id: string;
  operands: readonly TypedKind[];
  /** The last operand kind may repeat, at least once. */
  variadic?: boolean;
  result: TypedKind;
  run: (operands: readonly TypedValue[], locale: Locale) => Result<{ value: TypedValue; working: string }, CalcRefusal>;
};

export type CalcResult = Result<CalcOutput, CalcRefusal>;
