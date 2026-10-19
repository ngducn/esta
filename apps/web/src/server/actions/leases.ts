'use server';

import { isoDate, type IsoDate } from '@esta/core/date';
import { activationRefusals, type ActivationRefusal } from '@esta/core/lease';
import { LEASE_COLUMNS, leaseRowSchema } from '@esta/core/schemas/lease';
import { RENEWAL_INCREASE_BPS } from '@esta/core/lease';
import { MAX_AMOUNT_VND } from '@esta/core/money';
import { isoDateSchema, text } from '@esta/core/schemas/legal';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { phoneText } from '@esta/core/phone';
import type { Result } from '@esta/core/result';
import { vnd, type Vnd } from '@esta/core/money';
import { leaseCreate, leaseEdit, personCreate, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Tenant } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
import { createSessionClient } from '@/server/supabase/server';

const uuid = z.uuid();

export type TenantWrite = { readonly ok: true; readonly tenant: Tenant } | { readonly ok: false; readonly reason: 'name' | 'phone' | 'failed' };

/** LSE-1: a party tagged `tenant`, its phone stored the way `normalizePhone` writes it. The quick add never asked about namesakes, so it allows them. */
export async function createTenant(raw: unknown): Promise<TenantWrite> {
  const result = await runOp(personCreate, await webOpContext(), { id: randomUUID(), person: raw, allow_duplicate: true });
  if (!result.ok) {
    const { reason } = result;
    if (reason.kind !== 'invalid') return { ok: false, reason: 'failed' };
    return { ok: false, reason: reason.issues.some((issue) => issue.path === 'person.full_name') ? 'name' : 'phone' };
  }
  const { id, full_name, phone } = result.value;
  return { ok: true, tenant: { id, fullName: full_name, phone: phoneText(phone) } };
}

export type LeaseWrite = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: 'invalid' | 'notDraft' | 'failed' };

function revalidateLeases() {
  revalidatePath('/properties', 'layout');
  revalidatePath('/collections');
}

function leaseWriteRefusal(kind: string): Extract<LeaseWrite, { ok: false }>['reason'] {
  if (kind === 'not_draft' || kind === 'not_found') return 'notDraft';
  return kind === 'invalid' || kind === 'conflict' ? 'invalid' : 'failed';
}

/** Saves a draft; an active lease changes only through an amendment (P3-08). */
export async function saveLease(propertyId: unknown, leaseId: unknown, raw: unknown): Promise<LeaseWrite> {
  const ctx = await webOpContext();
  const result =
    leaseId === null
      ? await runOp(leaseCreate, ctx, { id: randomUUID(), property_id: propertyId, lease: raw })
      : await runOp(leaseEdit, ctx, { id: leaseId, property_id: propertyId, set: raw });
  if (!result.ok) return { ok: false, reason: leaseWriteRefusal(result.reason.kind) };
  revalidateLeases();
  return { ok: true, id: result.value.id };
}

export type ActivationRefusalReason = ActivationRefusal | 'paid_through_invalid' | 'already_active' | 'overlap' | 'failed';

/** What activation and a renewal refuse about `Đã thu tiền đến hết ngày`, shown under that field. */
export type PaidThroughRefusal = Extract<ActivationRefusalReason, 'paid_through_invalid' | 'paid_through_before_start'>;

export type ActivationResult = { readonly ok: true; readonly issuedMonth: IsoDate | null } | { readonly ok: false; readonly reasons: readonly ActivationRefusalReason[] };

/** `Đã thu tiền đến hết ngày` as typed: empty is nothing collected, and anything else must be a day on the calendar. */
function readPaidThrough(raw: unknown): Result<IsoDate | null, 'paid_through_invalid'> {
  const typed = typeof raw === 'string' ? parseOptionalDateInput(raw) : null;
  return typed?.ok === true ? typed : { ok: false, reason: 'paid_through_invalid' };
}

export type BillPreview = {
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  readonly rentVnd: Vnd;
  readonly issuesNow: boolean;
};

const previewRowSchema = z.object({
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  due_date: isoDateSchema,
  rent_vnd: z.number().int().transform((amount) => vnd(amount)),
  issues_now: z.boolean(),
});

/** What activation would bill with this paid-through date, planned by the same database function that writes it. */
export async function previewActivation(leaseId: unknown, paidThrough: unknown): Promise<readonly BillPreview[] | null> {
  const id = uuid.safeParse(leaseId);
  const through = readPaidThrough(paidThrough);
  if (!id.success || !through.ok) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('preview_activation', { p_lease_id: id.data, ...(through.value === null ? {} : { p_paid_through: through.value }) });
  if (error) return null;
  return z
    .array(previewRowSchema)
    .parse(data)
    .map((row) => ({ periodStart: row.period_start, periodEnd: row.period_end, dueDate: row.due_date, rentVnd: row.rent_vnd, issuesNow: row.issues_now }));
}

function refusalOf(error: { readonly code: string; readonly message: string }): ActivationRefusalReason {
  if (error.message === 'ESTA_LEASE_ALREADY_ACTIVE') return 'already_active';
  return error.code === '23P01' ? 'overlap' : 'failed';
}

/**
 * LSE-2 and LSE-3. `activate_lease` moves the draft to `active` with its paid-through date and writes the invoices it
 * owes on the database clock's date, in one transaction. A lease another tab activated first is reported as such, and
 * this call's paid-through date is not applied.
 */
export async function activateLease(leaseId: unknown, paidThrough: unknown): Promise<ActivationResult> {
  const id = uuid.safeParse(leaseId);
  if (!id.success) return { ok: false, reasons: ['failed'] };
  const through = readPaidThrough(paidThrough);
  if (!through.ok) return { ok: false, reasons: [through.reason] };
  const paidThroughDate = through.value;
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const read = await supabase.from('leases').select(LEASE_COLUMNS).eq('household_id', member.household.id).eq('id', id.data).maybeSingle();
  if (read.error || read.data === null) return { ok: false, reasons: ['failed'] };
  const lease = leaseRowSchema.parse(read.data);
  if (lease.status === 'active') return { ok: false, reasons: ['already_active'] };
  const refusals = activationRefusals(
    { status: lease.status, tenantPartyId: lease.tenant_party_id, startDate: lease.start_date, rentVnd: lease.rent_vnd },
    paidThroughDate,
  );
  if (refusals.length > 0) return { ok: false, reasons: refusals };
  const { data, error } = await supabase.rpc('activate_lease', { p_lease_id: lease.id, ...(paidThroughDate === null ? {} : { p_paid_through: paidThroughDate }) });
  revalidateLeases();
  if (error) return { ok: false, reasons: [refusalOf(error)] };
  const latest = data
    .filter((invoice) => invoice.status === 'issued')
    .map((invoice) => invoice.period_start)
    .toSorted()
    .at(-1);
  return { ok: true, issuedMonth: latest === undefined ? null : isoDate(latest) };
}

/** What `amend_lease`, `terminate_lease` and `renew_lease` refuse, by the message each raises. */
const CHANGE_REFUSALS = {
  ESTA_LEASE_NOT_FOUND: 'failed',
  ESTA_LEASE_NOT_ACTIVE: 'not_active',
  ESTA_AMENDMENT_NOT_AFTER_AS_OF: 'not_after_as_of',
  ESTA_AMENDMENT_ALREADY_BILLED: 'already_billed',
  ESTA_AMENDMENT_DUPLICATE: 'duplicate_effective_start',
  ESTA_AMENDMENT_NOT_A_PERIOD_START: 'not_a_period_start',
  ESTA_AMENDMENT_MOVES_LATER: 'moves_later_amendment',
  ESTA_AMENDMENT_EMPTY: 'invalid',
  ESTA_TERMINATION_REASON: 'reason_required',
  ESTA_TERMINATION_DATE: 'date_outside_lease',
  ESTA_TERMINATION_BEFORE_ISSUED: 'before_issued',
  ESTA_LEASE_NOT_RENEWABLE: 'not_renewable',
  ESTA_LEASE_OPEN_ENDED: 'open_ended',
  ESTA_LEASE_ALREADY_RENEWED: 'already_renewed',
  ESTA_RENEWAL_INCREASE: 'invalid',
  ESTA_RENEWAL_END: 'end_before_start',
  ESTA_LEASE_OVERLAP: 'overlap',
  ESTA_PAID_THROUGH_BEFORE_START: 'paid_through_before_start',
} as const;

export type LeaseChangeRefusal = (typeof CHANGE_REFUSALS)[keyof typeof CHANGE_REFUSALS] | 'paid_through_invalid' | 'invalid' | 'failed';

export type LeaseChange<T = undefined> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: LeaseChangeRefusal };

function changeRefusal(error: { readonly message: string }): LeaseChangeRefusal {
  return error.message in CHANGE_REFUSALS ? CHANGE_REFUSALS[error.message as keyof typeof CHANGE_REFUSALS] : 'failed';
}

const rentSchema = z.number().int().min(1).max(MAX_AMOUNT_VND);

const amendmentSchema = z.strictObject({
  effectivePeriodStart: isoDateSchema,
  rentVnd: rentSchema,
  reason: z.string().trim().max(1000),
});

/**
 * LSE-2 and LSE-3: a new monthly rent from a later period start. `amend_lease` checks the start against the database
 * clock and what is already billed, writes the amendment and plans the drafts from that start again, so every issued
 * invoice stays as it was.
 */
export async function amendLease(leaseId: unknown, raw: unknown): Promise<LeaseChange> {
  const id = uuid.safeParse(leaseId);
  const value = amendmentSchema.safeParse(raw);
  if (!id.success || !value.success) return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('amend_lease', {
    p_lease_id: id.data,
    p_effective_period_start: value.data.effectivePeriodStart,
    p_rent_vnd: value.data.rentVnd,
    ...(value.data.reason === '' ? {} : { p_reason: value.data.reason }),
  });
  revalidateLeases();
  return error ? { ok: false, reason: changeRefusal(error) } : { ok: true, value: undefined };
}

const terminationSchema = z.strictObject({ terminatedOn: isoDateSchema, reason: text(1000) });

/** LSE-2: the lease ends on the chosen day for the stated reason, and no period after that day is ever billed (#144). */
export async function terminateLease(leaseId: unknown, raw: unknown): Promise<LeaseChange> {
  const id = uuid.safeParse(leaseId);
  if (!id.success) return { ok: false, reason: 'invalid' };
  const value = terminationSchema.safeParse(raw);
  if (!value.success) return { ok: false, reason: value.error.issues.some((issue) => issue.path[0] === 'reason') ? 'reason_required' : 'invalid' };
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('terminate_lease', { p_lease_id: id.data, p_terminated_on: value.data.terminatedOn, p_reason: value.data.reason });
  revalidateLeases();
  return error ? { ok: false, reason: changeRefusal(error) } : { ok: true, value: undefined };
}

const renewalSchema = z.strictObject({
  increaseBps: z.number().int().min(RENEWAL_INCREASE_BPS.min).max(RENEWAL_INCREASE_BPS.max),
  endDate: isoDateSchema.nullable(),
  paidThrough: z.string(),
});

/**
 * LSE-2 and SPEC §9.4 seed 7: a new active lease from the day after this one ends, at the rent `renewalRent` previews.
 * `paidThrough` is `Đã thu tiền đến hết ngày` as typed, read and billed as activation reads and bills it.
 */
export async function renewLease(leaseId: unknown, raw: unknown): Promise<LeaseChange<string>> {
  const id = uuid.safeParse(leaseId);
  const value = renewalSchema.safeParse(raw);
  if (!id.success || !value.success) return { ok: false, reason: 'invalid' };
  const through = readPaidThrough(value.data.paidThrough);
  if (!through.ok) return { ok: false, reason: through.reason };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('renew_lease', {
    p_lease_id: id.data,
    p_increase_bps: value.data.increaseBps,
    ...(value.data.endDate === null ? {} : { p_end_date: value.data.endDate }),
    ...(through.value === null ? {} : { p_paid_through: through.value }),
  });
  revalidateLeases();
  if (error) return { ok: false, reason: changeRefusal(error) };
  return { ok: true, value: uuid.parse(data) };
}
