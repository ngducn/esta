'use server';

import { vnd, type Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const PAYMENT_METHODS = ['cash', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The sheet as Mẹ filled it. Amount and date stay text, so a value that does not read is refused, never taken as 0 or today. */
const paymentInputSchema = z.object({
  invoiceId: z.uuid(),
  owedVnd: z.number().int().nonnegative(),
  amount: z.string(),
  method: z.enum(PAYMENT_METHODS),
  receivedOn: z.string(),
  idempotencyKey: z.uuid(),
  invoiceIds: z.array(z.uuid()).nullable(),
});
export type PaymentInput = z.input<typeof paymentInputSchema>;

/** `stale` and `nothingOwed` mean the board Mẹ opened the sheet from is out of date. */
export type RecordPaymentRefusal = 'amount' | 'date' | 'dateAfterToday' | 'choice' | 'stale' | 'nothingOwed' | 'failed';
export type RecordPaymentResult =
  | { readonly ok: true; readonly payment: { readonly id: string; readonly amountVnd: Vnd; readonly allocatedVnd: Vnd } }
  | { readonly ok: false; readonly reason: RecordPaymentRefusal };

const REFUSALS: Readonly<Record<string, RecordPaymentRefusal>> = {
  ESTA_PAYMENT_DATE_AFTER_TODAY: 'dateAfterToday',
  ESTA_ALLOCATION_CHOICE: 'choice',
  ESTA_PAYMENT_STALE: 'stale',
  ESTA_NOTHING_OWED: 'nothingOwed',
};

const recordedSchema = z.tuple([z.object({ id: z.uuid(), amount_vnd: z.number().int().transform(vnd), allocated_vnd: z.number().int().transform(vnd) })]);

function revalidatePayments() {
  revalidatePath('/collections');
  revalidatePath('/properties', 'layout');
}

/**
 * LSE-7. `record_payment` writes the payment and its allocations in one transaction: oldest due first over the lease's
 * open invoices, or over the invoices Mẹ chose. The key comes from the sheet, so a second tap or a retry after a cut
 * response returns the payment already recorded (SPEC §7.4). `owedVnd` is what the sheet saw owed when it opened, so a
 * sheet left open while someone else records the row is refused rather than paying a later invoice.
 */
export async function recordPayment(raw: unknown): Promise<RecordPaymentResult> {
  const input = paymentInputSchema.safeParse(raw);
  if (!input.success) return { ok: false, reason: 'failed' };
  const amount = parseVndInput(input.data.amount);
  if (!amount.ok) return { ok: false, reason: 'amount' };
  const receivedOn = parseDateInput(input.data.receivedOn);
  if (!receivedOn.ok) return { ok: false, reason: 'date' };
  if (input.data.invoiceIds?.length === 0) return { ok: false, reason: 'choice' };
  const [, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.data.invoiceId,
    p_owed_vnd: input.data.owedVnd,
    p_amount_vnd: amount.value,
    p_method: input.data.method,
    p_received_on: receivedOn.value,
    p_idempotency_key: input.data.idempotencyKey,
    ...(input.data.invoiceIds === null ? {} : { p_invoice_ids: input.data.invoiceIds }),
  });
  if (error) return { ok: false, reason: REFUSALS[error.message] ?? 'failed' };
  revalidatePayments();
  const [payment] = recordedSchema.parse(data);
  return { ok: true, payment: { id: payment.id, amountVnd: payment.amount_vnd, allocatedVnd: payment.allocated_vnd } };
}

/** `Hoàn tác` on the saved toast. Repeating it is harmless; a payment past its window or recorded by someone else stays. */
export async function undoPayment(paymentId: unknown): Promise<{ readonly ok: boolean }> {
  const id = z.uuid().safeParse(paymentId);
  if (!id.success) return { ok: false };
  const [, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { error } = await supabase.rpc('undo_payment', { p_payment_id: id.data });
  revalidatePayments();
  return { ok: error === null };
}
