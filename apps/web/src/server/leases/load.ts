import 'server-only';
import { PAYMENT_STATUSES, type PaymentStatus } from '@esta/core/allocation';
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
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { readLeases, readLeaseSchedule, scheduleUntil, tenantRowSchema, withTenants, type LeaseWithTenant, type Tenant } from '@esta/ops';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type { LeaseWithTenant, Tenant } from '@esta/ops';

export type InvoiceSummary = {
  readonly id: string;
  readonly leaseId: string;
  readonly number: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  readonly issueOn: IsoDate;
  readonly status: 'draft' | 'issued' | 'void';
  readonly totalVnd: Vnd;
  /** Still owed after allocated payments; an issued invoice with none left is settled. */
  readonly outstandingVnd: Vnd;
  readonly paymentStatus: PaymentStatus;
};

export type PropertyLeases = {
  readonly leases: readonly LeaseWithTenant[];
  readonly invoices: readonly InvoiceSummary[];
  /** In effective order. */
  readonly amendments: readonly LeaseAmendmentRow[];
  /** Every lease's periods through its end date, or two years past the Clock's date when it has none. */
  readonly schedule: readonly SchedulePeriod[];
};

const invoiceRowSchema = z
  .object({
    id: z.uuid(),
    lease_id: z.uuid(),
    number: z.string(),
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    due_date: isoDateSchema,
    issue_on: isoDateSchema,
    status: z.enum(['draft', 'issued', 'void']),
    total_vnd: z.number().int(),
    outstanding_vnd: z.number().int().min(0),
    payment_status: z.enum(PAYMENT_STATUSES),
  })
  .transform(
    (row): InvoiceSummary => ({
      id: row.id,
      leaseId: row.lease_id,
      number: row.number,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      dueDate: row.due_date,
      issueOn: row.issue_on,
      status: row.status,
      totalVnd: vnd(row.total_vnd),
      outstandingVnd: vnd(row.outstanding_vnd),
      paymentStatus: row.payment_status,
    }),
  );

const INVOICE_COLUMNS = 'id, lease_id, number, period_start, period_end, due_date, issue_on, status, total_vnd, outstanding_vnd, payment_status';

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
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('invoice_balances').select(INVOICE_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('period_start'),
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('lease_amendments').select(LEASE_AMENDMENT_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('effective_period_start'),
    readLeaseSchedule(supabase, ids, scheduleUntil(rows, asOf)),
  ]);
  if (invoices.error) throw new Error(`Reading invoices failed: ${invoices.error.message}`);
  if (amendments.error) throw new Error(`Reading lease amendments failed: ${amendments.error.message}`);
  return {
    leases,
    invoices: z.array(invoiceRowSchema).parse(invoices.data),
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
