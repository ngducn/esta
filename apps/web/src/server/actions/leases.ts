'use server';

import { isoDate, type IsoDate } from '@esta/core/date';
import { activationRefusals, type ActivationRefusal } from '@esta/core/lease';
import { LEASE_COLUMNS, leaseDraftSchema, leaseRowSchema, tenantSchema } from '@esta/core/schemas/lease';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { formatPhone } from '@esta/core/phone';
import type { Result } from '@esta/core/result';
import { vnd, type Vnd } from '@esta/core/money';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Tenant } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { fieldsHoldingIds } from '@/server/national-id';
import { createSessionClient } from '@/server/supabase/server';

const uuid = z.uuid();

export type TenantWrite =
  | { readonly ok: true; readonly tenant: Tenant }
  | { readonly ok: false; readonly reason: 'name' | 'phone' | 'national_id' | 'failed' };

/** LSE-1: a party tagged `tenant`, its phone stored the way `normalizePhone` writes it. A name holding a full ID is refused before the write (D11). */
export async function createTenant(raw: unknown): Promise<TenantWrite> {
  const value = tenantSchema.safeParse(raw);
  if (!value.success) return { ok: false, reason: value.error.issues.some((issue) => issue.path[0] === 'full_name') ? 'name' : 'phone' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const held = await fieldsHoldingIds(supabase, [['full_name', value.data.full_name]]);
  if (held === null) return { ok: false, reason: 'failed' };
  if (held.length > 0) return { ok: false, reason: 'national_id' };
  const { data, error } = await supabase
    .from('parties')
    .insert({ household_id: member.household.id, kind: 'individual', full_name: value.data.full_name, phone: value.data.phone, tags: ['tenant'] })
    .select('id, full_name, phone')
    .single();
  if (error) return { ok: false, reason: 'failed' };
  return { ok: true, tenant: { id: data.id, fullName: data.full_name, phone: formatPhone(value.data.phone) } };
}

export type LeaseWrite = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: 'invalid' | 'notDraft' | 'failed' };

function revalidateLeases() {
  revalidatePath('/properties', 'layout');
}

/** Saves a draft under the session client; an active lease changes only through an amendment (P3-08). */
export async function saveLease(propertyId: unknown, leaseId: unknown, raw: unknown): Promise<LeaseWrite> {
  const property = uuid.safeParse(propertyId);
  const lease = leaseId === null ? { success: true as const, data: null } : uuid.safeParse(leaseId);
  const value = leaseDraftSchema.safeParse(raw);
  if (!property.success || !lease.success || !value.success) return { ok: false, reason: 'invalid' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const match = { household_id: member.household.id, property_id: property.data };
  const { data, error } =
    lease.data === null
      ? await supabase.from('leases').insert({ ...value.data, ...match }).select('id').single()
      : await supabase.from('leases').update(value.data).match(match).eq('id', lease.data).eq('status', 'draft').select('id').maybeSingle();
  if (error) return { ok: false, reason: error.code === '23503' || error.code === '23514' ? 'invalid' : 'failed' };
  if (data === null) return { ok: false, reason: 'notDraft' };
  revalidateLeases();
  return { ok: true, id: data.id };
}

export type ActivationRefusalReason = ActivationRefusal | 'paid_through_invalid' | 'already_active' | 'overlap' | 'failed';

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
