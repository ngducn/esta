import type { IsoDate } from '@esta/core/date';
import { addMonths } from '@esta/core/date/calendar';
import { phoneText } from '@esta/core/phone';
import type { SchedulePeriod } from '@esta/core/schedule';
import { LEASE_COLUMNS, leaseRowSchema, schedulePeriodRowSchema, type LeaseRow } from '@esta/core/schemas/lease';
import { z } from 'zod';
import type { Db } from './db';
import { idSchema } from './kit';

export type Tenant = { readonly id: string; readonly fullName: string; readonly phone: string | null };
export type LeaseWithTenant = LeaseRow & { readonly tenant: Tenant | null };

/** A party as the lease screens show a tenant, the phone written for reading. */
export const tenantRowSchema = z
  .object({ id: idSchema, full_name: z.string(), phone: z.string().nullable() })
  .transform((row): Tenant => ({ id: row.id, fullName: row.full_name, phone: phoneText(row.phone) }));

/** The household's leases, those with a start first and earliest first: all, one property's, or one. */
export async function readLeases(db: Db, householdId: string, where: Partial<Pick<LeaseRow, 'id' | 'property_id'>> = {}): Promise<LeaseRow[]> {
  const { data, error } = await db.from('leases').select(LEASE_COLUMNS).eq('household_id', householdId).match(where).order('start_date', { nullsFirst: false }).order('id');
  if (error) throw new Error(`Reading leases failed: ${error.message}`);
  return z.array(leaseRowSchema).parse(data);
}

/** Each lease beside its tenant, read in one query. */
export async function withTenants(db: Db, householdId: string, leases: readonly LeaseRow[]): Promise<LeaseWithTenant[]> {
  const ids = [...new Set(leases.flatMap((lease) => (lease.tenant_party_id === null ? [] : [lease.tenant_party_id])))];
  const read = ids.length === 0 ? { data: [], error: null } : await db.from('parties').select('id, full_name, phone').eq('household_id', householdId).in('id', ids);
  if (read.error) throw new Error(`Reading tenants failed: ${read.error.message}`);
  const tenants = new Map(z.array(tenantRowSchema).parse(read.data).map((tenant) => [tenant.id, tenant]));
  return leases.map((lease) => ({ ...lease, tenant: lease.tenant_party_id === null ? null : (tenants.get(lease.tenant_party_id) ?? null) }));
}

/** An open-ended lease plans this far ahead, enough for the amendment picker and a year of timeline. */
const OPEN_ENDED_MONTHS = 24;

/** How far to plan these leases: their last end date, and at least two years past `asOf`. */
export function scheduleUntil(leases: readonly Pick<LeaseRow, 'end_date'>[], asOf: IsoDate): IsoDate {
  return leases.reduce((latest, lease) => (lease.end_date !== null && lease.end_date > latest ? lease.end_date : latest), addMonths(asOf, OPEN_ENDED_MONTHS));
}

/**
 * The periods `public.lease_schedule` plans for these leases, each starting on or before `until`, beside the invoice that
 * bills it. The database is the one planner (#195); a lease the member cannot see has none.
 */
export async function readLeaseSchedule(db: Db, leaseIds: readonly string[], until: IsoDate): Promise<SchedulePeriod[]> {
  if (leaseIds.length === 0) return [];
  const { data, error } = await db.rpc('lease_schedule', { p_lease_ids: [...leaseIds], p_until: until });
  if (error) throw new Error(`Reading the lease schedule failed: ${error.message}`);
  return z.array(schedulePeriodRowSchema).parse(data);
}
