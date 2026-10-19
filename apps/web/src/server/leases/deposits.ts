import 'server-only';
import { DEPOSIT_KINDS, type DepositEntry } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/** One ledger line as lease detail lists it: an applied line names the period of the invoice it paid. */
export type DepositLine = DepositEntry & { readonly note: string | null; readonly invoicePeriodStart: IsoDate | null };

const entryRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DEPOSIT_KINDS),
  amount_vnd: z.number().int().positive(),
  on_date: isoDateSchema,
  note: z.string().nullable(),
  payment_id: z.uuid().nullable(),
});

const allocationRowSchema = z.object({ payment_id: z.uuid(), invoices: z.object({ period_start: isoDateSchema }) });

/**
 * The lease's deposit entries in the order `deposit_low_point` reads them (date, then when they were written), so
 * deriveDepositLedger meets the same sequence the database refused or accepted.
 */
export const loadDepositLines = cache(async (leaseId: string): Promise<DepositLine[]> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const entries = await supabase
    .from('deposit_entries')
    .select('id, kind, amount_vnd, on_date, note, payment_id')
    .match({ household_id: member.household.id, lease_id: leaseId })
    .order('on_date')
    .order('created_at')
    .order('id');
  if (entries.error) throw new Error(`Reading deposit entries failed: ${entries.error.message}`);
  const rows = z.array(entryRowSchema).parse(entries.data);
  const payments = rows.flatMap((row) => (row.payment_id === null ? [] : [row.payment_id]));
  const paid = new Map<string, IsoDate>();
  if (payments.length > 0) {
    const allocations = await supabase.from('payment_allocations').select('payment_id, invoices(period_start)').in('payment_id', payments);
    if (allocations.error) throw new Error(`Reading deposit applications failed: ${allocations.error.message}`);
    for (const row of z.array(allocationRowSchema).parse(allocations.data)) paid.set(row.payment_id, row.invoices.period_start);
  }
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amountVnd: vnd(row.amount_vnd),
    onDate: row.on_date,
    note: row.note,
    invoicePeriodStart: row.payment_id === null ? null : (paid.get(row.payment_id) ?? null),
  }));
});

const heldRowSchema = z.object({ held_vnd: z.number().int().nonnegative() });

/** LSE-9: every deposit the household holds for its tenants, a sum it owes back, from the `lease_deposits` view. */
export const loadHeldDepositTotal = cache(async (householdId: string): Promise<Vnd> => {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('lease_deposits').select('held_vnd').eq('household_id', householdId).gt('held_vnd', 0);
  if (error) throw new Error(`Reading held deposits failed: ${error.message}`);
  return vnd(z.array(heldRowSchema).parse(data).reduce((sum, row) => sum + row.held_vnd, 0));
});
