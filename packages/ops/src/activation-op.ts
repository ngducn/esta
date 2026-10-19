import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import { activationRefusals, type ActivationRefusal } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import type { Database } from '@esta/db';
import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows, type ViewRows } from './view';

const activationInputSchema = z.strictObject({ lease_id: idSchema, paid_through: isoDateSchema.nullable() });
type Activation = z.output<typeof activationInputSchema>;

type Invoice = Database['public']['Functions']['activate_lease']['Returns'][number];
export type Activated = { readonly lease_id: string; readonly invoices: readonly Invoice[] };
export type ActivationOpRefusal =
  | { readonly kind: 'cannot_activate'; readonly reasons: readonly ActivationRefusal[] }
  | { readonly kind: 'already_active' }
  | { readonly kind: 'overlap' };

const SENTINELS: Readonly<Record<string, ActivationOpRefusal | CommonRefusal>> = {
  ESTA_LEASE_ALREADY_ACTIVE: { kind: 'already_active' },
  ESTA_LEASE_OVERLAP: { kind: 'overlap' },
  ESTA_LEASE_NOT_FOUND: { kind: 'not_found' },
  ESTA_LEASE_TRANSITION: { kind: 'cannot_activate', reasons: ['not_draft'] },
};

/** A bill activation would write, as `preview_activation` and `preview_lease_bills` return it. */
export const billRowSchema = z.object({
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  due_date: isoDateSchema,
  rent_vnd: z.number().int().transform((amount) => vnd(amount)),
  issues_now: z.boolean(),
});

async function invoicesOf(ctx: OpContext, leaseId: string): Promise<Invoice[]> {
  const { data, error } = await ctx.db
    .from('invoices')
    .select('id, period_start, period_end, due_date, status')
    .eq('household_id', ctx.householdId)
    .eq('lease_id', leaseId)
    .order('period_start');
  if (error) throw new Error(`Reading the lease's invoices failed: ${error.message}`);
  return data;
}

async function billsOf(ctx: OpContext, lease: ViewRows['leases'], paidThrough: IsoDate | null) {
  const { data, error } = await ctx.db.rpc('preview_lease_bills', {
    p_household_id: ctx.householdId,
    p_lease: lease,
    ...(paidThrough === null ? {} : { p_paid_through: paidThrough }),
  });
  if (error) throw new Error(`Previewing the bills failed: ${error.message}`);
  return z.array(billRowSchema).parse(data);
}

/**
 * LSE-2 and LSE-3: the draft becomes active with its paid-through date, and `activate_lease` writes the invoices it owes
 * on the database clock's date. A lease already active with the same date is the activation landed, so a batch taken
 * over after a crash converges.
 */
export const leaseActivate = defineOp<Activation, Activation, Activated, ActivationOpRefusal>({
  creates: null,
  input: activationInputSchema,
  async plan(ctx, { lease_id, paid_through }) {
    const [lease] = await viewRows(ctx, 'leases', { id: lease_id });
    if (lease === undefined) return refuse({ kind: 'not_found' });
    if (lease.status === 'active') {
      return lease.paid_through_date === paid_through ? unchanged({ lease_id, invoices: await invoicesOf(ctx, lease_id) }) : refuse({ kind: 'already_active' });
    }
    const reasons = activationRefusals({ status: lease.status, tenantPartyId: lease.tenant_party_id, startDate: lease.start_date, rentVnd: lease.rent_vnd }, paid_through);
    return reasons.length > 0 ? refuse({ kind: 'cannot_activate', reasons }) : change({ lease_id, paid_through });
  },
  async apply(ctx, { lease_id, paid_through }) {
    const { data, error } = await ctx.db.rpc('activate_lease', { p_lease_id: lease_id, ...(paid_through === null ? {} : { p_paid_through: paid_through }) });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { lease_id, invoices: data } };
  },
  writes: ({ lease_id, paid_through }) => [{ kind: 'set', table: 'leases', id: lease_id, set: { status: 'active', paid_through_date: paid_through } }],
  async preview(ctx, { lease_id, paid_through }) {
    const [lease] = await viewRows(ctx, 'leases', { id: lease_id });
    const bills = lease === undefined ? [] : await billsOf(ctx, lease, paid_through);
    return {
      paid_through_display: paid_through === null ? null : formatDate(paid_through, 'vi'),
      bills: bills.map((bill) => ({ ...bill, rent_display: formatVnd(bill.rent_vnd, 'vi') })),
    };
  },
});
