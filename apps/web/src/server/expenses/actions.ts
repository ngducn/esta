'use server';

import { expenseInputSchema, expenseProblems, type ExpenseInput, type ExpenseProblems } from '@esta/core/expenses';
import { vnd, type Vnd } from '@esta/core/money';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type ExpenseSaved =
  | { readonly ok: true; readonly expense: { readonly id: string; readonly amountVnd: Vnd } }
  | { readonly ok: false; readonly reason: 'invalid'; readonly problems: ExpenseProblems }
  | { readonly ok: false; readonly reason: 'forbidden' | 'failed' };

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

const failed = { ok: false, reason: 'failed' } as const;
const savedSchema = z.object({ id: z.uuid(), amount_vnd: z.number().int().transform(vnd), property_id: z.uuid() });

function revalidateProperty(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`, 'layout');
}

/** A vendor added in the sheet becomes a party tagged `contractor`, under the id the sheet minted, so a retry adds one. */
async function vendorId(supabase: SessionClient, household: string, vendor: ExpenseInput['vendor']): Promise<string | null | false> {
  if (vendor === null) return null;
  if (vendor.kind === 'existing') return vendor.id;
  const { error } = await supabase
    .from('parties')
    .upsert({ id: vendor.id, household_id: household, kind: 'individual', full_name: vendor.fullName, tags: ['contractor'] }, { onConflict: 'id', ignoreDuplicates: true });
  return error ? false : vendor.id;
}

async function parse(input: unknown) {
  const [clock, member] = await Promise.all([readRequestClock(), requireMember()]);
  const parsed = expenseInputSchema(clock.today()).safeParse(input);
  return { member, parsed };
}

function columns(input: ExpenseInput, vendor: string | null) {
  return {
    property_id: input.propertyId,
    category: input.category,
    amount_vnd: input.amount,
    paid_on: input.paidOn,
    vendor_party_id: vendor,
    document_id: input.documentId,
    note: input.note,
  };
}

/**
 * `Lưu` on a new expense. The id comes from the sheet, so a second tap or a retry after a lost response finds the row
 * the first one wrote and reports it, never a second row. The amount reported is the one stored.
 */
export async function createExpense(input: unknown): Promise<ExpenseSaved> {
  const { member, parsed } = await parse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid', problems: expenseProblems(parsed.error) };
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const household = member.household.id;
  const supabase = await createSessionClient();
  const vendor = await vendorId(supabase, household, parsed.data.vendor);
  if (vendor === false) return failed;
  const { error } = await supabase
    .from('expenses')
    .upsert({ id: parsed.data.id, household_id: household, ...columns(parsed.data, vendor) }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return failed;
  const { data } = await supabase.from('expenses').select('id, amount_vnd, property_id').eq('household_id', household).eq('id', parsed.data.id).maybeSingle();
  const saved = savedSchema.safeParse(data);
  if (!saved.success) return failed;
  revalidateProperty(saved.data.property_id);
  return { ok: true, expense: { id: saved.data.id, amountVnd: saved.data.amount_vnd } };
}

/** `Lưu` on an expense opened from the list: every field the sheet shows is written as it now reads. */
export async function updateExpense(input: unknown): Promise<ExpenseSaved> {
  const { member, parsed } = await parse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid', problems: expenseProblems(parsed.error) };
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const household = member.household.id;
  const supabase = await createSessionClient();
  const vendor = await vendorId(supabase, household, parsed.data.vendor);
  if (vendor === false) return failed;
  const { data, error } = await supabase
    .from('expenses')
    .update(columns(parsed.data, vendor))
    .eq('household_id', household)
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .select('id, amount_vnd, property_id');
  const saved = z.tuple([savedSchema]).safeParse(data);
  if (error || !saved.success) return failed;
  const [row] = saved.data;
  revalidateProperty(row.property_id);
  return { ok: true, expense: { id: row.id, amountVnd: row.amount_vnd } };
}

async function setDeletedAt(expenseId: unknown, deletedAt: (now: string) => string | null): Promise<{ readonly ok: boolean }> {
  const id = z.uuid().safeParse(expenseId);
  if (!id.success) return { ok: false };
  const [clock, member] = await Promise.all([readRequestClock(), requireMember()]);
  if (member.role === 'viewer') return { ok: false };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('expenses')
    .update({ deleted_at: deletedAt(clock.now()) })
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .select('property_id');
  const [row] = data ?? [];
  if (error || row === undefined) return { ok: false };
  revalidateProperty(row.property_id);
  return { ok: true };
}

/** Deleting sets `deleted_at`; the row stays, so the toast's `Hoàn tác` brings it back. */
export async function deleteExpense(expenseId: unknown): Promise<{ readonly ok: boolean }> {
  return setDeletedAt(expenseId, (now) => now);
}

export async function restoreExpense(expenseId: unknown): Promise<{ readonly ok: boolean }> {
  return setDeletedAt(expenseId, () => null);
}
