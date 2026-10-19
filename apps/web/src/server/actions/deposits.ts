'use server';

import { DEPOSIT_KINDS } from '@esta/core/allocation';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import type { Result } from '@esta/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/** The deposit sheet as Mẹ filled it. Amount and date stay text, so a value that does not read is refused, never taken as 0 or today. */
const depositInputSchema = z.object({
  leaseId: z.uuid(),
  kind: z.enum(DEPOSIT_KINDS),
  invoiceId: z.uuid().nullable(),
  amount: z.string(),
  onDate: z.string(),
  note: z.string().max(1000),
  idempotencyKey: z.uuid(),
});
export type DepositInput = z.input<typeof depositInputSchema>;

export type RecordDepositRefusal =
  | 'amount'
  | 'date'
  | 'dateAfterToday'
  | 'noteRequired'
  | 'exceedsHeld'
  | 'exceedsOutstanding'
  | 'invoice'
  | 'notActive'
  | 'failed';

/** The entry written, or the one a repeated key already wrote. */
export type RecordDepositResult = Result<string, RecordDepositRefusal>;

/** What `record_deposit_entry` and `apply_deposit` refuse, by the message each raises. */
const REFUSALS: Readonly<Record<string, RecordDepositRefusal>> = {
  ESTA_DEPOSIT_DATE_AFTER_TODAY: 'dateAfterToday',
  ESTA_DEPOSIT_NOTE_REQUIRED: 'noteRequired',
  ESTA_DEPOSIT_EXCEEDS_HELD: 'exceedsHeld',
  ESTA_DEPOSIT_EXCEEDS_OUTSTANDING: 'exceedsOutstanding',
  ESTA_DEPOSIT_AMOUNT: 'amount',
  ESTA_INVOICE_NOT_FOUND: 'invoice',
  ESTA_LEASE_NOT_ACTIVE: 'notActive',
};

/**
 * LSE-7 and LSE-9. A deposit received, deducted or refunded is one `deposit_entries` row; applying it to an invoice also
 * writes the deposit payment and its allocation, in the same transaction. Both functions take the lease lock, check the
 * date against the database clock and refuse an entry that takes out more than is held. The key comes from the sheet,
 * so a second tap or a retry after a cut response writes nothing new (SPEC §7.4).
 */
export async function recordDeposit(raw: unknown): Promise<RecordDepositResult> {
  const input = depositInputSchema.safeParse(raw);
  if (!input.success) return { ok: false, reason: 'failed' };
  const { leaseId, kind, invoiceId, note, idempotencyKey } = input.data;
  const amount = parseVndInput(input.data.amount);
  if (!amount.ok) return { ok: false, reason: 'amount' };
  const onDate = parseDateInput(input.data.onDate);
  if (!onDate.ok) return { ok: false, reason: 'date' };
  if (kind === 'applied' && invoiceId === null) return { ok: false, reason: 'invoice' };
  const [, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const common = {
    p_lease_id: leaseId,
    p_amount_vnd: amount.value,
    p_on_date: onDate.value,
    p_idempotency_key: idempotencyKey,
    ...(note.trim() === '' ? {} : { p_note: note }),
  };
  const { data, error } =
    kind === 'applied' && invoiceId !== null
      ? await supabase.rpc('apply_deposit', { ...common, p_invoice_id: invoiceId })
      : await supabase.rpc('record_deposit_entry', { ...common, p_kind: kind });
  if (error) return { ok: false, reason: REFUSALS[error.message] ?? 'failed' };
  revalidatePath('/properties', 'layout');
  revalidatePath('/collections');
  return { ok: true, value: data };
}
