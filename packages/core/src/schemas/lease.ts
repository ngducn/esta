import { z } from 'zod';
import { BILLING_CYCLES, LEASE_STATUSES, PERIOD_ANCHORS, PRORATIONS, TAX_PAYERS, UTILITIES_MODES } from '../lease/types';
import { MAX_AMOUNT_VND, vnd } from '../money/vnd';
import { normalizePhone, type Phone } from '../phone';
import type { Amendment, Escalation, SchedulePeriod } from '../schedule/types';
import { isoDateSchema, text } from './legal';
import { vndSchema } from './property';

const moneySchema = vndSchema.refine((amount) => amount <= MAX_AMOUNT_VND);
const cycleSchema = z.union(BILLING_CYCLES.map((cycle) => z.literal(cycle)));
const everyMonths = z.number().int().min(1).max(120);
/** Rounds each step to a multiple of this many đồng, so 0 cannot divide. */
const roundingSchema = moneySchema.refine((amount) => amount >= 1);

/** `leases.escalation` as SPEC §5.4 stores it: `value` is basis points for `percent` and đồng for `fixed`. */
export const escalationJsonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('percent'), value: z.number().int().min(1).max(10_000), every_months: everyMonths, rounding_vnd: roundingSchema.optional() }),
  z.object({ kind: z.literal('fixed'), value: moneySchema, every_months: everyMonths, rounding_vnd: roundingSchema.optional() }),
]);
export type EscalationJson = z.output<typeof escalationJsonSchema>;

export function toEscalation(json: EscalationJson): Escalation {
  if (json.kind === 'none') return json;
  return json.kind === 'percent'
    ? { kind: 'percent', valueBps: json.value, everyMonths: json.every_months }
    : { kind: 'fixed', valueVnd: vnd(json.value), everyMonths: json.every_months };
}

/** What `createLease` and `updateLease` accept: a draft may still miss its tenant, start or rent (LSE-2). */
export const leaseDraftSchema = z
  .strictObject({
    unit_id: z.uuid(),
    tenant_party_id: z.uuid().nullable(),
    start_date: isoDateSchema.nullable(),
    end_date: isoDateSchema.nullable(),
    rent_vnd: moneySchema.refine((amount) => amount > 0).nullable(),
    billing_cycle_months: cycleSchema,
    period_anchor: z.enum(PERIOD_ANCHORS),
    first_period_proration: z.enum(PRORATIONS),
    deposit_vnd: moneySchema.nullable(),
    escalation: escalationJsonSchema,
    utilities_mode: z.enum(UTILITIES_MODES),
    tax_payer: z.enum(TAX_PAYERS),
    notice_days: z.number().int().min(0).max(365).nullable(),
  })
  .refine((lease) => lease.start_date === null || lease.end_date === null || lease.end_date >= lease.start_date, { path: ['end_date'] });
export type LeaseDraft = z.output<typeof leaseDraftSchema>;

/** LSE-1: a tenant is a name and a phone, normalized so Zalo and reminders can use it. */
export const tenantSchema = z.strictObject({
  full_name: text(200),
  phone: z.string().transform((value, ctx): Phone => {
    const phone = normalizePhone(value);
    if (phone.ok) return phone.value;
    ctx.addIssue({ code: 'custom', message: phone.reason });
    return z.NEVER;
  }),
});

const nullableDate = isoDateSchema.nullable();
const storedVnd = z
  .number()
  .int()
  .nullable()
  .transform((amount) => (amount === null ? null : vnd(amount)));

/** A `leases` row as the session client reads it. */
export const leaseRowSchema = z.object({
  id: z.uuid(),
  property_id: z.uuid(),
  unit_id: z.uuid(),
  tenant_party_id: z.uuid().nullable(),
  start_date: nullableDate,
  end_date: nullableDate,
  rent_vnd: storedVnd,
  billing_cycle_months: cycleSchema,
  period_anchor: z.enum(PERIOD_ANCHORS),
  first_period_proration: z.enum(PRORATIONS),
  due_offset_days: z.number().int(),
  deposit_vnd: storedVnd,
  escalation: escalationJsonSchema,
  utilities_mode: z.enum(UTILITIES_MODES),
  tax_payer: z.enum(TAX_PAYERS),
  notice_days: z.number().int().nullable(),
  paid_through_date: nullableDate,
  status: z.enum(LEASE_STATUSES),
  terminated_on: nullableDate,
  termination_reason: z.string().nullable(),
  renewal_of_lease_id: z.uuid().nullable(),
});
export type LeaseRow = z.output<typeof leaseRowSchema>;

export const LEASE_COLUMNS =
  'id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor, first_period_proration, due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer, notice_days, paid_through_date, status, terminated_on, termination_reason, renewal_of_lease_id';

/** A `lease_amendments` row: `changes` holds a monthly rent, a billing cycle, or both (SPEC §5.4). */
export const leaseAmendmentRowSchema = z
  .object({
    id: z.uuid(),
    lease_id: z.uuid(),
    effective_period_start: isoDateSchema,
    changes: z.object({ rent_vnd: z.number().int().positive().optional(), billing_cycle_months: cycleSchema.optional() }),
    reason: z.string().nullable(),
  })
  .transform(
    (row): Amendment & { readonly id: string; readonly leaseId: string; readonly reason: string | null } => ({
      id: row.id,
      leaseId: row.lease_id,
      reason: row.reason,
      effectivePeriodStart: row.effective_period_start,
      changes: {
        ...(row.changes.rent_vnd === undefined ? {} : { rentVnd: vnd(row.changes.rent_vnd) }),
        ...(row.changes.billing_cycle_months === undefined ? {} : { billingCycleMonths: row.changes.billing_cycle_months }),
      },
    }),
  );
export type LeaseAmendmentRow = z.output<typeof leaseAmendmentRowSchema>;

export const LEASE_AMENDMENT_COLUMNS = 'id, lease_id, effective_period_start, changes, reason';

/** A `public.lease_schedule` row. */
export const schedulePeriodRowSchema = z
  .object({
    lease_id: z.uuid(),
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    due_date: isoDateSchema,
    monthly_rent_vnd: z.number().int().positive(),
    rent_vnd: z.number().int().min(0),
    covered_by_paid_through: z.boolean(),
    invoice_id: z.uuid().nullable(),
  })
  .transform(
    (row): SchedulePeriod => ({
      leaseId: row.lease_id,
      start: row.period_start,
      end: row.period_end,
      dueDate: row.due_date,
      monthlyRentVnd: vnd(row.monthly_rent_vnd),
      rentVnd: vnd(row.rent_vnd),
      coveredByPaidThrough: row.covered_by_paid_through,
      invoiceId: row.invoice_id,
    }),
  );
