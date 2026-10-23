import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { holdsUnit } from '@esta/core/lease';
import type { SchedulePeriod } from '@esta/core/schedule';
import {
  LEASE_AMENDMENT_COLUMNS,
  LEASE_COLUMNS,
  leaseAmendmentRowSchema,
  leaseRowSchema,
  type LeaseAmendmentRow,
  type LeaseRow,
} from '@esta/core/schemas/lease';
import { readInvoices, readLeases, readLeaseSchedule, scheduleUntil, tenantRowSchema, withTenants, type InvoiceSummary, type LeaseWithTenant, type Tenant } from '@esta/ops';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type { InvoiceSummary, LeaseWithTenant, Tenant } from '@esta/ops';

export type PropertyLeases = {
  readonly leases: readonly LeaseWithTenant[];
  readonly invoices: readonly InvoiceSummary[];
  /** In effective order. */
  readonly amendments: readonly LeaseAmendmentRow[];
  /** Every lease's periods through its end date, or two years past the Clock's date when it has none. */
  readonly schedule: readonly SchedulePeriod[];
};

/**
 * Every lease of the property with its tenant, its amendments, its planned periods, and every invoice with its balance.
 * RLS scopes them to the member.
 */
export const loadPropertyLeases = cache(async (propertyId: string, asOf: IsoDate): Promise<PropertyLeases> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const rows = await readLeases(supabase, member.household.id, { property_id: propertyId });
  const ids = rows.map((row) => row.id);
  const [leases, invoices, amendments, schedule] = await Promise.all([
    withTenants(supabase, member.household.id, rows),
    readInvoices(supabase, member.household.id, { leaseIds: ids }),
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('lease_amendments').select(LEASE_AMENDMENT_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('effective_period_start'),
    readLeaseSchedule(supabase, ids, scheduleUntil(rows, asOf)),
  ]);
  if (amendments.error) throw new Error(`Reading lease amendments failed: ${amendments.error.message}`);
  return {
    leases,
    invoices,
    amendments: z.array(leaseAmendmentRowSchema).parse(amendments.data),
    schedule,
  };
});

export async function loadTenants(): Promise<Tenant[]> {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase
    .from('parties')
    .select('id, full_name, phone')
    .eq('household_id', member.household.id)
    .contains('tags', ['tenant'])
    .order('full_name');
  if (error) throw new Error(`Reading tenants failed: ${error.message}`);
  return z.array(tenantRowSchema).parse(data);
}

export async function loadLeaseSchedule(leaseIds: readonly string[], until: IsoDate): Promise<SchedulePeriod[]> {
  return readLeaseSchedule(await createSessionClient(), leaseIds, until);
}

export type HoldingLeases = { readonly leases: readonly LeaseRow[]; readonly schedule: readonly SchedulePeriod[] };

/** The leases holding a unit on `asOf` with their periods through it, across the household or on one property. */
export async function loadHoldingLeases(householdId: string, asOf: IsoDate, propertyId?: string): Promise<HoldingLeases> {
  const supabase = await createSessionClient();
  const scope = propertyId === undefined ? { household_id: householdId } : { household_id: householdId, property_id: propertyId };
  const leases = await supabase.from('leases').select(LEASE_COLUMNS).match(scope).in('status', ['active', 'terminated']);
  if (leases.error) throw new Error(`Reading leases failed: ${leases.error.message}`);
  const rows = z.array(leaseRowSchema).parse(leases.data).filter((row) => holdsUnit(row, asOf));
  return { leases: rows, schedule: await loadLeaseSchedule(rows.map((row) => row.id), asOf) };
}
