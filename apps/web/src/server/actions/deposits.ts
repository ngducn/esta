'use server';

import { DEPOSIT_KINDS, type DepositKind } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { MAX_AMOUNT_VND } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import type { Result } from '@esta/core/result';
import { depositRecord, runOp, type CommonRefusal, type DepositRefusal } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
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

const amountSchema = z.number().int().min(1).max(MAX_AMOUNT_VND);

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

/** What `apply_deposit` refuses, by the message it raises. */
const APPLY_REFUSALS: Readonly<Record<string, RecordDepositRefusal>> = {
  ESTA_DEPOSIT_DATE_AFTER_TODAY: 'dateAfterToday',
  ESTA_DEPOSIT_EXCEEDS_HELD: 'exceedsHeld',
  ESTA_DEPOSIT_EXCEEDS_OUTSTANDING: 'exceedsOutstanding',
  ESTA_DEPOSIT_AMOUNT: 'amount',
  ESTA_INVOICE_NOT_FOUND: 'invoice',
  ESTA_LEASE_NOT_ACTIVE: 'notActive',
};

const RECORD_REFUSALS: Partial<Record<(DepositRefusal | CommonRefusal)['kind'], RecordDepositRefusal>> = {
  not_active: 'notActive',
  date_after_today: 'dateAfterToday',
  note_required: 'noteRequired',
  exceeds_held: 'exceedsHeld',
};

type Entry = { readonly id: string; readonly lease_id: string; readonly amount_vnd: number; readonly on_date: IsoDate; readonly note: string | null };

async function recordEntry(entry: Entry, kind: Exclude<DepositKind, 'applied'>): Promise<RecordDepositResult> {
  const result = await runOp(depositRecord, await webOpContext(), { ...entry, kind });
  if (result.ok) return { ok: true, value: result.value.entry_id };
  const { reason } = result;
  if (reason.kind === 'invalid') return { ok: false, reason: reason.issues.some((issue) => issue.path === 'amount_vnd') ? 'amount' : 'failed' };
  return { ok: false, reason: RECORD_REFUSALS[reason.kind] ?? 'failed' };
}

/** Writes the deposit payment, its allocation and the `applied` entry together. */
async function applyToInvoice(entry: Entry, invoiceId: string | null): Promise<RecordDepositResult> {
  if (invoiceId === null) return { ok: false, reason: 'invoice' };
  const [, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase.rpc('apply_deposit', {
    p_lease_id: entry.lease_id,
    p_invoice_id: invoiceId,
    p_amount_vnd: entry.amount_vnd,
    p_on_date: entry.on_date,
    p_idempotency_key: entry.id,
    ...(entry.note === null ? {} : { p_note: entry.note }),
  });
  return error ? { ok: false, reason: APPLY_REFUSALS[error.message] ?? 'failed' } : { ok: true, value: data };
}

/**
 * LSE-7 and LSE-9. A deposit received, deducted or refunded is one `deposit_entries` row; applying it to an invoice also
 * writes the deposit payment and its allocation, in the same transaction. Both take the lease lock, check the date
 * against the database clock and refuse an entry that takes out more than is held. The key comes from the sheet, so a
 * second tap or a retry after a cut response writes nothing new (SPEC §7.4).
 */
export async function recordDeposit(raw: unknown): Promise<RecordDepositResult> {
  const input = depositInputSchema.safeParse(raw);
  if (!input.success) return { ok: false, reason: 'failed' };
  const { leaseId, kind, invoiceId, note, idempotencyKey } = input.data;
  const typed = parseVndInput(input.data.amount);
  const amount = amountSchema.safeParse(typed.ok ? typed.value : null);
  if (!amount.success) return { ok: false, reason: 'amount' };
  const onDate = parseDateInput(input.data.onDate);
  if (!onDate.ok) return { ok: false, reason: 'date' };
  const entry = { id: idempotencyKey, lease_id: leaseId, amount_vnd: amount.data, on_date: onDate.value, note: note.trim() === '' ? null : note };
  const result = kind === 'applied' ? await applyToInvoice(entry, invoiceId) : await recordEntry(entry, kind);
  if (result.ok) {
    revalidatePath('/properties', 'layout');
    revalidatePath('/collections');
  }
  return result;
}
