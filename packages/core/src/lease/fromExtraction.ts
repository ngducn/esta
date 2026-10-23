import { z } from 'zod';
import { leaseV1Schema } from '../agent-schemas/lease_v1';
import { addDays, addMonths } from '../date/calendar';
import { normalizeName } from '../extraction/acceptance';
import { vnd } from '../money/vnd';
import { firstPhone } from '../phone';
import type { LeaseDraft } from '../schemas/lease';

/** The lease terms a scanned contract fills in; every key is a term the form marks `Từ hợp đồng đã quét`. */
export type LeaseTermsFromContract = { readonly [K in 'unit_id' | 'start_date' | 'end_date' | 'rent_vnd' | 'billing_cycle_months' | 'deposit_vnd']?: NonNullable<LeaseDraft[K]> };

export type LeaseFromContract = {
  readonly terms: LeaseTermsFromContract;
  /** Who the contract names as tenant, for the quick add or an existing tenant with the same name and phone. */
  readonly tenant: { readonly fullName: string; readonly phone: string | null } | null;
};

const { shape } = leaseV1Schema;
const entryOrAbsent = <T extends z.ZodType>(value: T) => z.object({ value }).optional().catch(undefined);
const acceptedLeaseSchema = z.object({
  tenant_name: entryOrAbsent(shape.tenant_name.shape.value),
  tenant_phone: entryOrAbsent(shape.tenant_phone.shape.value),
  unit_label: entryOrAbsent(shape.unit_label.shape.value),
  start_date: entryOrAbsent(shape.start_date.shape.value),
  end_date: entryOrAbsent(shape.end_date.shape.value),
  term_months: entryOrAbsent(shape.term_months.shape.value),
  rent_vnd: entryOrAbsent(shape.rent_vnd.shape.value.refine((rent) => rent !== 0)),
  billing_cycle_months: entryOrAbsent(shape.billing_cycle_months.shape.value),
  deposit_vnd: entryOrAbsent(shape.deposit_vnd.shape.value),
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
  const fullName = read.tenant_name?.value?.normalize('NFC') ?? null;
  return { terms, tenant: fullName === null ? null : { fullName, phone: read.tenant_phone?.value ?? null } };
}

/**
 * The household's tenant the contract names: the same name and the same phone, both read. A namesake without a matching
 * phone is someone else to the form, which then offers the quick add instead.
 */
export function contractTenant<T extends { readonly fullName: string; readonly phone: string | null }>(tenants: readonly T[], read: LeaseFromContract['tenant']): T | null {
  const phone = read === null ? null : firstPhone([read.phone]);
  if (read === null || phone === null) return null;
  return tenants.find((tenant) => firstPhone([tenant.phone]) === phone && normalizeName(tenant.fullName) === normalizeName(read.fullName)) ?? null;
}
