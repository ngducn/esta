import { calculate, type CalcRefusal, type TypedValue } from '@esta/core/calc';
import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { z } from 'zod';
import type { FactSheet } from '@esta/core/guard';
import { sameAnswer, type RunSheet } from './fact-sheet';
import { calculateOperations, parseToolInput, ToolRejection } from './server';

const inputSchema = z.strictObject({ op: z.string(), operands: z.array(z.string()).min(1).max(12) });
const USAGE = 'calculate takes {"op": one of the listed operations, "operands": fields of records that hold a number, such as "f3.rent_display", never a number you write yourself}';

const typedSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('vnd'), value: z.number().int().transform(vnd) }),
  z.strictObject({ kind: z.literal('bp'), value: z.number().int() }),
  z.strictObject({ kind: z.literal('count'), value: z.number().int(), unit: z.string() }),
  z.strictObject({ kind: z.literal('months'), value: z.number().int() }),
  z.strictObject({ kind: z.literal('date'), value: z.string().transform(isoDate) }),
]);

const OPERAND = /^(f\d+)\.([a-z][a-z0-9_]*)_display$/;

function operandOf(ref: string, sheet: FactSheet): TypedValue {
  const parts = OPERAND.exec(ref);
  if (parts === null) throw new ToolRejection(`${JSON.stringify(ref)} is not a field of a record. ${USAGE}`);
  const [, handle = '', stem = ''] = parts;
  const record = sheet.get(handle);
  if (record === undefined) throw new ToolRejection(`${handle} is not a record of this turn, so ${ref} holds no number`);
  const typed = typedSchema.safeParse(record[`${stem}_typed`]);
  if (!typed.success) throw new ToolRejection(`${ref} holds no number a calculation can use`);
  return typed.data;
}

function refusal(reason: CalcRefusal, refs: readonly string[]): string {
  switch (reason.kind) {
    case 'unknown_op':
      return `No such operation. Use one of: ${calculateOperations()}`;
    case 'arity':
      return `This operation takes ${reason.expected} operands, and you gave ${reason.got}`;
    case 'wrong_kind':
      return `Operand ${reason.index + 1} (${refs[reason.index]}) is a ${reason.got}, and this operation wants a ${reason.expected} there`;
    case 'overflow':
      return 'The result is too large to be a figure Esta can state';
    case 'invalid':
      return `The operands do not fit this operation: ${reason.why}`;
  }
}

export type Calculation = { readonly handle: string; readonly op: string; readonly operands: readonly string[]; readonly result_display: string; readonly working_display: string };

/** `calculate` (AGENT.md §4): one registered operation over fields the run already holds. Its result is a record, so a later call can use it and the answer can cite `result_display`. */
export function calculateTool({ sheet, cite, locale, log }: { readonly sheet: FactSheet; readonly cite: RunSheet['cite']; readonly locale: Locale; readonly log?: Calculation[] }) {
  return sameAnswer(async (raw: Record<string, unknown>): Promise<unknown> => {
    const { op, operands: refs } = parseToolInput(inputSchema, raw, USAGE);
    const ran = calculate(op, refs.map((ref) => operandOf(ref, sheet)), locale);
    if (!ran.ok) throw new ToolRejection(refusal(ran.reason, refs));
    const { value, result_display, working_display } = ran.value;
    const record = cite({ op, result_display, result_typed: value, working_display });
    log?.push({ handle: record.handle, op, operands: refs, result_display, working_display });
    return record;
  });
}
