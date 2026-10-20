'use server';

import { NEW_VENDOR_TAG, readExpense, type ExpenseProblems } from '@esta/core/expenses';
import { vnd, type Vnd } from '@esta/core/money';
import { documentRow } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { setDeletedAt } from '@/server/soft-delete';
import { createSessionClient } from '@/server/supabase/server';

export type ExpenseSaved =
  | { readonly ok: true; readonly expense: { readonly id: string; readonly amountVnd: Vnd } }
  | { readonly ok: false; readonly reason: 'invalid'; readonly problems: ExpenseProblems }
  | { readonly ok: false; readonly reason: 'forbidden' | 'failed' };

const failed = { ok: false, reason: 'failed' } as const;
const savedSchema = z.tuple([z.object({ id: z.uuid(), amount_vnd: z.number().int().transform(vnd), property_id: z.uuid() })]);

/**
 * `Lưu` on the expense sheet, for a new expense or one opened from the list. `save_expense` writes it in one
 * transaction with a vendor added in the sheet, tagged `contractor`, and the receipt photo, registered as its document.
 * The ids come from the sheet, so a second tap or a retry after a lost answer writes nothing new. The amount reported
 * is the one stored.
 */
export async function saveExpense(input: unknown): Promise<ExpenseSaved> {
  const [clock, member] = await Promise.all([readRequestClock(), requireMember()]);
  const read = readExpense(input, clock.today());
  if (!read.ok) return { ok: false, reason: 'invalid', problems: read.problems };
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const { id, propertyId, category, amount, paidOn, note, vendor, receipt } = read.value;
  const supabase = await createSessionClient();
  const document =
    receipt?.kind === 'new'
      ? await documentRow(supabase, member.household.id, { ...receipt, propertyId, category: 'invoice_receipt', expiresOn: null, leaseId: null })
      : null;
  if (receipt?.kind === 'new' && document === null) return failed;
  const { data, error } = await supabase.rpc('save_expense', {
    p_id: id,
    p_property_id: propertyId,
    p_category: category,
    p_amount_vnd: amount,
    p_paid_on: paidOn,
    ...(note === null ? {} : { p_note: note }),
    ...(vendor === null ? {} : { p_vendor_id: vendor.id }),
    ...(vendor?.kind === 'new' ? { p_new_vendor: { kind: 'individual', full_name: vendor.fullName, tags: [NEW_VENDOR_TAG] } } : {}),
    ...(receipt === null ? {} : { p_document_id: receipt.documentId }),
    ...(document === null ? {} : { p_new_document: document }),
  });
  const saved = savedSchema.safeParse(data);
  if (error || !saved.success) return failed;
  const [row] = saved.data;
  revalidatePath(`/properties/${row.property_id}`, 'layout');
  return { ok: true, expense: { id: row.id, amountVnd: row.amount_vnd } };
}

function softDeleted(id: string | null): { readonly ok: boolean } {
  if (id === null) return { ok: false };
  revalidatePath('/properties', 'layout');
  return { ok: true };
}

/** Deleting sets `deleted_at`; the row stays, so the toast's `Hoàn tác` brings it back. */
export async function deleteExpense(expenseId: unknown): Promise<{ readonly ok: boolean }> {
  return softDeleted(await setDeletedAt('expenses', expenseId, true));
}

export async function restoreExpense(expenseId: unknown): Promise<{ readonly ok: boolean }> {
  return softDeleted(await setDeletedAt('expenses', expenseId, false));
}
