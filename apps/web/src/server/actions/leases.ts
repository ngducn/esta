'use server';

import { isoDate, isIsoDate, type IsoDate } from '@esta/core/date';
import { activationRefusals, type ActivationRefusal } from '@esta/core/lease';
import { LEASE_COLUMNS, leaseDraftSchema, leaseRowSchema, tenantSchema } from '@esta/core/schemas/lease';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { runInvoicing } from '@/server/leases/invoicing';
import type { Tenant } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const uuid = z.uuid();

export type TenantWrite = { readonly ok: true; readonly tenant: Tenant } | { readonly ok: false; readonly reason: 'name' | 'phone' | 'failed' };

/** LSE-1: a party tagged `tenant`, its phone stored the way `normalizePhone` writes it. */
export async function createTenant(raw: unknown): Promise<TenantWrite> {
  const value = tenantSchema.safeParse(raw);
  if (!value.success) return { ok: false, reason: value.error.issues.some((issue) => issue.path[0] === 'full_name') ? 'name' : 'phone' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase
    .from('parties')
    .insert({ household_id: member.household.id, kind: 'individual', full_name: value.data.full_name, phone: value.data.phone, tags: ['tenant'] })
    .select('id, full_name, phone')
    .single();
  if (error) return { ok: false, reason: 'failed' };
  return { ok: true, tenant: { id: data.id, fullName: data.full_name, phone: data.phone } };
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

export type ActivationResult =
  | { readonly ok: true; readonly issuedMonth: IsoDate | null }
  | { readonly ok: false; readonly reasons: readonly (ActivationRefusal | 'overlap' | 'failed')[] };

const paidThroughSchema = z.string().refine(isIsoDate).nullable();

/**
 * LSE-2 and LSE-3. Moves a draft to `active` with its paid-through date, then runs invoicing on the Clock's date. A lease
 * already active skips straight to invoicing, so a retry after a lost response converges and inserts nothing new.
 */
export async function activateLease(leaseId: unknown, paidThrough: unknown): Promise<ActivationResult> {
  const id = uuid.safeParse(leaseId);
  const through = paidThroughSchema.safeParse(paidThrough);
  if (!id.success || !through.success) return { ok: false, reasons: ['failed'] };
  const paidThroughDate = through.data === null ? null : isoDate(through.data);
  const [member, supabase, clock] = await Promise.all([requireMember(), createSessionClient(), readRequestClock()]);
  const read = await supabase.from('leases').select(LEASE_COLUMNS).eq('household_id', member.household.id).eq('id', id.data).maybeSingle();
  if (read.error || read.data === null) return { ok: false, reasons: ['failed'] };
  const lease = leaseRowSchema.parse(read.data);
  if (lease.status !== 'active') {
    const refusals = activationRefusals(
      { status: lease.status, tenantPartyId: lease.tenant_party_id, startDate: lease.start_date, endDate: lease.end_date, rentVnd: lease.rent_vnd },
      paidThroughDate,
    );
    if (refusals.length > 0) return { ok: false, reasons: refusals };
    const { error } = await supabase
      .from('leases')
      .update({ status: 'active', paid_through_date: paidThroughDate })
      .eq('id', lease.id)
      .eq('status', 'draft');
    if (error) return { ok: false, reasons: [error.code === '23P01' ? 'overlap' : 'failed'] };
  }
  const asOf = clock.today();
  let written;
  try {
    written = await runInvoicing(supabase, lease.id, asOf, clock.now());
  } catch {
    revalidateLeases();
    return { ok: false, reasons: ['failed'] };
  }
  revalidateLeases();
  const issued = written.filter((invoice) => invoice.status === 'issued' && invoice.period_start <= asOf).map((invoice) => invoice.period_start);
  const latest = issued.toSorted().at(-1);
  return { ok: true, issuedMonth: latest === undefined ? null : isoDate(latest) };
}
