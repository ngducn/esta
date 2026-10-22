import { z } from 'zod';
import { leaseV1Schema } from '../agent-schemas/lease_v1';
import { addDays, addMonths } from '../date/calendar';
import { vnd } from '../money/vnd';
import type { LeaseDraft } from '../schemas/lease';

/** The lease terms a scanned contract fills in; every key is a term the form marks `Từ hợp đồng đã quét`. */
export type LeaseTermsFromContract = Partial<Pick<LeaseDraft, 'unit_id' | 'start_date' | 'end_date' | 'rent_vnd' | 'billing_cycle_months' | 'deposit_vnd'>>;

export type LeaseFromContract = {
  readonly terms: LeaseTermsFromContract;
  /** Who the contract names as tenant, for the quick add or an existing tenant with the same name and phone. */
  readonly tenant: { readonly fullName: string; readonly phone: string | null } | null;
};

const { shape } = leaseV1Schema;
/** One `accepted_fields` entry: the value read or typed, held to its leaf's own bounds; anything else reads as absent. */
const entry = <T extends z.ZodType>(value: T) => z.object({ value }).optional().catch(undefined);
const acceptedLeaseSchema = z.object({
  tenant_name: entry(shape.tenant_name.shape.value),
  tenant_phone: entry(shape.tenant_phone.shape.value),
  unit_label: entry(shape.unit_label.shape.value),
  start_date: entry(shape.start_date.shape.value),
  end_date: entry(shape.end_date.shape.value),
  term_months: entry(shape.term_months.shape.value),
  rent_vnd: entry(shape.rent_vnd.shape.value.refine((rent) => rent !== 0)),
  billing_cycle_months: entry(shape.billing_cycle_months.shape.value),
  deposit_vnd: entry(shape.deposit_vnd.shape.value),
});

const sameLabel = (label: string) => label.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi');

/**
 * The lease form's fields from an extraction Mẹ accepted (`document_extractions.accepted_fields`). A contract that prints
 * only a term ends the day before the term runs out, and an end before the start is left for Mẹ to type.
 */
export function leaseFieldsFromExtraction(acceptedFields: unknown, units: readonly { readonly id: string; readonly label: string }[]): LeaseFromContract {
  const parsed = acceptedLeaseSchema.safeParse(acceptedFields);
  if (!parsed.success) return { terms: {}, tenant: null };
  const read = parsed.data;
  const start = read.start_date?.value ?? null;
  const term = read.term_months?.value ?? null;
  const end = read.end_date?.value ?? (start !== null && term !== null ? addDays(addMonths(start, term), -1) : null);
  const label = read.unit_label?.value ?? null;
  const unit = label === null ? undefined : units.find((candidate) => sameLabel(candidate.label) === sameLabel(label));
  const terms: LeaseTermsFromContract = {
    ...(unit === undefined ? {} : { unit_id: unit.id }),
    ...(start === null ? {} : { start_date: start }),
    ...(end === null || (start !== null && end < start) ? {} : { end_date: end }),
    ...(read.rent_vnd?.value == null ? {} : { rent_vnd: vnd(read.rent_vnd.value) }),
    ...(read.billing_cycle_months?.value == null ? {} : { billing_cycle_months: read.billing_cycle_months.value }),
    ...(read.deposit_vnd?.value == null ? {} : { deposit_vnd: vnd(read.deposit_vnd.value) }),
  };
  const fullName = read.tenant_name?.value ?? null;
  return { terms, tenant: fullName === null ? null : { fullName, phone: read.tenant_phone?.value ?? null } };
}
