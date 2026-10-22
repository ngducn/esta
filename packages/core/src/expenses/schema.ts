import { z } from 'zod';
import type { IsoDate } from '../date/iso-date';
import { documentTitleSchema, sentDocumentSchema } from '../documents/file';
import type { Vnd } from '../money/vnd';
import { parseDateUpToToday, type PastDateReason } from '../parse/date-input';
import { parsePositiveVnd, type PositiveVndReason } from '../parse/vnd-input';
import { EXPENSE_CATEGORY_IDS } from './categories';

export const MAX_EXPENSE_NOTE = 1000;
export const MAX_VENDOR_NAME = 200;

export const NEW_VENDOR_TAG = 'contractor';
/** The tags of the parties the vendor picker offers: the people and firms an owner pays for work on a property. */
export const VENDOR_TAGS = [NEW_VENDOR_TAG, 'broker', 'other'] as const;

export type AmountProblem = PositiveVndReason;
export type PaidOnProblem = PastDateReason;

const vendorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), id: z.uuid() }),
  z.object({ kind: z.literal('new'), id: z.uuid(), fullName: z.string().trim().min(1).max(MAX_VENDOR_NAME) }),
]);
export type ExpenseVendor = z.output<typeof vendorSchema>;

/** A receipt already filed, or a photo in Storage that saving the expense registers as its document. */
const receiptSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), documentId: z.uuid() }),
  sentDocumentSchema.extend({ kind: z.literal('new'), title: documentTitleSchema }),
]);
export type ExpenseReceipt = z.output<typeof receiptSchema>;

const textsSchema = z.object({ amount: z.string(), paidOn: z.string().default('') });

/** The id comes from the sheet, so a retried save writes one row. */
const fieldsSchema = z.object({
  id: z.uuid(),
  propertyId: z.uuid(),
  category: z.enum(EXPENSE_CATEGORY_IDS),
  vendor: vendorSchema.nullable(),
  receipt: receiptSchema.nullable(),
  note: z
    .string()
    .max(MAX_EXPENSE_NOTE)
    .default('')
    .transform((text) => (text.trim() === '' ? null : text.trim())),
});

export type ExpenseInput = z.output<typeof fieldsSchema> & { readonly amount: Vnd; readonly paidOn: IsoDate };

export type ExpenseProblems = { readonly amount?: AmountProblem; readonly paidOn?: PaidOnProblem; readonly form?: 'invalid' };

/**
 * The expense sheet as Mẹ filled it. The amount and the date are read as typed and refused on their own fields, both
 * at once; anything else that does not parse is a `form` problem, which the sheet never sends.
 */
export function readExpense(
  input: unknown,
  today: IsoDate,
): { readonly ok: true; readonly value: ExpenseInput } | { readonly ok: false; readonly problems: ExpenseProblems } {
  const texts = textsSchema.safeParse(input);
  const fields = fieldsSchema.safeParse(input);
  const amount = texts.success ? parsePositiveVnd(texts.data.amount) : null;
  const paidOn = texts.success ? parseDateUpToToday(texts.data.paidOn, today) : null;
  if (fields.success && amount?.ok && paidOn?.ok) return { ok: true, value: { ...fields.data, amount: amount.value, paidOn: paidOn.value } };
  return {
    ok: false,
    problems: {
      ...(amount === null || amount.ok ? {} : { amount: amount.reason }),
      ...(paidOn === null || paidOn.ok ? {} : { paidOn: paidOn.reason }),
      ...(fields.success && texts.success ? {} : { form: 'invalid' }),
    },
  };
}
