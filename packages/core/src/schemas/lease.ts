import { z } from 'zod';
import { BILLING_CYCLES, LEASE_STATUSES, PERIOD_ANCHORS, PRORATIONS, TAX_PAYERS, UTILITIES_MODES } from '../lease/types';
import { vnd } from '../money/vnd';
import { normalizePhone, type Phone } from '../phone';
import type { Escalation, LeaseTerms } from '../schedule/types';
import { DEFAULT_ESCALATION_ROUNDING_VND } from '../schedule/escalation';
import { isoDateSchema, text } from './legal';
import { vndSchema } from './property';
import { MAX_LIST_RENT_VND } from './units';

const moneySchema = vndSchema.refine((amount) => amount <= MAX_LIST_RENT_VND);
const cycleSchema = z.union(BILLING_CYCLES.map((cycle) => z.literal(cycle)));
const everyMonths = z.number().int().min(1).max(120);

/** `leases.escalation` as SPEC §5.4 stores it: `value` is basis points for `percent` and đồng for `fixed`. */
export const escalationJsonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('percent'), value: z.number().int().min(1).max(10_000), every_months: everyMonths, rounding_vnd: moneySchema.optional() }),
  z.object({ kind: z.literal('fixed'), value: moneySchema, every_months: everyMonths, rounding_vnd: moneySchema.optional() }),
]);
export type EscalationJson = z.output<typeof escalationJsonSchema>;

export function toEscalation(json: EscalationJson): Escalation {
  if (json.kind === 'none') return json;
  const roundingVnd = json.rounding_vnd === undefined ? DEFAULT_ESCALATION_ROUNDING_VND : vnd(json.rounding_vnd);
  return json.kind === 'percent'
    ? { kind: 'percent', valueBps: json.value, everyMonths: json.every_months, roundingVnd }
    : { kind: 'fixed', valueVnd: vnd(json.value), everyMonths: json.every_months, roundingVnd };
}

/** What `createLease` and `updateLease` accept: a draft may still miss its tenant, start or rent (LSE-2). */
export const leaseDraftSchema = z
  .strictObject({
    unit_id: z.uuid(),
    tenant_party_id: z.uuid().nullable(),
    start_date: isoDateSchema.nullable(),
    end_date: isoDateSchema.nullable(),
    rent_vnd: moneySchema.nullable(),
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
});
export type LeaseRow = z.output<typeof leaseRowSchema>;

export const LEASE_COLUMNS =
  'id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor, first_period_proration, due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer, notice_days, paid_through_date, status';

/** The schedule terms of a lease that has its start and rent; a draft without them has none. */
export function leaseTerms(row: LeaseRow): LeaseTerms | null {
  if (row.start_date === null || row.rent_vnd === null) return null;
  return {
    startDate: row.start_date,
    endDate: row.end_date,
    rentVnd: row.rent_vnd,
    billingCycleMonths: row.billing_cycle_months,
    periodAnchor: row.period_anchor,
    firstPeriodProration: row.first_period_proration,
    dueOffsetDays: row.due_offset_days,
    escalation: toEscalation(row.escalation),
    paidThroughDate: row.paid_through_date,
  };
}
