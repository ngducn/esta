import { z } from 'zod';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { parseDateInput, type DateInputReason } from '../parse/date-input';
import { parseVndInput, type VndInputReason } from '../parse/vnd-input';
import { EXPENSE_CATEGORY_IDS } from './categories';

export const MAX_EXPENSE_NOTE = 1000;
export const MAX_VENDOR_NAME = 200;

export type AmountProblem = VndInputReason | 'not_positive';
export type PaidOnProblem = Exclude<DateInputReason, 'empty'> | 'after_today';

const vendorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), id: z.uuid() }),
  z.object({ kind: z.literal('new'), id: z.uuid(), fullName: z.string().trim().min(1).max(MAX_VENDOR_NAME) }),
]);
export type ExpenseVendor = z.output<typeof vendorSchema>;

/**
 * The expense sheet as Mẹ filled it. The amount stays text, read by `parseVndInput`, so `3tr5` saves 3.500.000 and a
 * text that does not read is refused, never taken as 0. An empty date is the Clock's business date, and a later day
 * is refused. The id comes from the sheet, so a retried save writes one row. Each refusal is an issue on its field
 * whose message is an `AmountProblem` or a `PaidOnProblem`.
 */
export function expenseInputSchema(today: IsoDate) {
  return z.object({
    id: z.uuid(),
    propertyId: z.uuid(),
    category: z.enum(EXPENSE_CATEGORY_IDS),
    amount: z.string().transform((text, ctx): Vnd => {
      const parsed = parseVndInput(text);
      if (parsed.ok && parsed.value > 0) return parsed.value;
      ctx.addIssue({ code: 'custom', message: parsed.ok ? 'not_positive' : parsed.reason });
      return z.NEVER;
    }),
    paidOn: z
      .string()
      .default('')
      .transform((text, ctx): IsoDate => {
        const parsed = parseDateInput(text);
        if (!parsed.ok && parsed.reason === 'empty') return today;
        if (parsed.ok && parsed.value <= today) return parsed.value;
        ctx.addIssue({ code: 'custom', message: parsed.ok ? 'after_today' : parsed.reason });
        return z.NEVER;
      }),
    vendor: vendorSchema.nullable(),
    documentId: z.uuid().nullable(),
    note: z
      .string()
      .max(MAX_EXPENSE_NOTE)
      .default('')
      .transform((text) => (text.trim() === '' ? null : text.trim())),
  });
}

export type ExpenseInput = z.output<ReturnType<typeof expenseInputSchema>>;

export type ExpenseProblems = { readonly amount?: AmountProblem; readonly paidOn?: PaidOnProblem; readonly form?: 'invalid' };

/** The refusals of a failed parse by field, for the sheet's inline messages. */
export function expenseProblems(error: z.ZodError): ExpenseProblems {
  const problems: { amount?: AmountProblem; paidOn?: PaidOnProblem; form?: 'invalid' } = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (field === 'amount' && issue.code === 'custom') problems.amount = issue.message as AmountProblem;
    else if (field === 'paidOn' && issue.code === 'custom') problems.paidOn = issue.message as PaidOnProblem;
    else problems.form = 'invalid';
  }
  return problems;
}
