import 'server-only';
import { PAYMENT_STATUSES, type PaymentStatus } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { holdsUnit } from '@esta/core/lease';
import { LEASE_AMENDMENT_COLUMNS, LEASE_COLUMNS, leaseAmendmentRowSchema, leaseRowSchema, type LeaseAmendmentRow, type LeaseRow } from '@esta/core/schemas/lease';
import { vnd, type Vnd } from '@esta/core/money';
import { formatPhone, normalizePhone } from '@esta/core/phone';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type Tenant = { readonly id: string; readonly fullName: string; readonly phone: string | null };

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

export type LeaseWithTenant = LeaseRow & { readonly tenant: Tenant | null };

export type PropertyLeases = {
  readonly leases: readonly LeaseWithTenant[];
  readonly invoices: readonly InvoiceSummary[];
  /** In effective order. */
  readonly amendments: readonly LeaseAmendmentRow[];
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

/** Phones are stored as `normalizePhone` writes them and shown as Mẹ reads them, `0903 123 456`. */
function phoneText(stored: string | null): string | null {
  if (stored === null) return null;
  const phone = normalizePhone(stored);
  return phone.ok ? formatPhone(phone.value) : stored;
}

const tenantRowSchema = z
  .object({ id: z.uuid(), full_name: z.string(), phone: z.string().nullable() })
  .transform((row): Tenant => ({ id: row.id, fullName: row.full_name, phone: phoneText(row.phone) }));

const INVOICE_COLUMNS = 'id, lease_id, number, period_start, period_end, due_date, issue_on, status, total_vnd, outstanding_vnd, payment_status';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

async function readTenants(supabase: SessionClient, householdId: string, ids: readonly string[]): Promise<Map<string, Tenant>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('parties').select('id, full_name, phone').eq('household_id', householdId).in('id', [...new Set(ids)]);
  if (error) throw new Error(`Reading tenants failed: ${error.message}`);
  return new Map(z.array(tenantRowSchema).parse(data).map((tenant) => [tenant.id, tenant]));
}

/** Every lease of the property with its tenant, its amendments, and every invoice with its balance. RLS scopes them to the member. */
export const loadPropertyLeases = cache(async (propertyId: string): Promise<PropertyLeases> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: propertyId };
  const { data, error } = await supabase.from('leases').select(LEASE_COLUMNS).match(scope).order('start_date', { nullsFirst: false }).order('id');
  if (error) throw new Error(`Reading leases failed: ${error.message}`);
  const rows = z.array(leaseRowSchema).parse(data);
  const ids = rows.map((row) => row.id);
  const [tenants, invoices, amendments] = await Promise.all([
    readTenants(supabase, member.household.id, rows.flatMap((row) => (row.tenant_party_id === null ? [] : [row.tenant_party_id]))),
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('invoice_balances').select(INVOICE_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('period_start'),
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('lease_amendments').select(LEASE_AMENDMENT_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('effective_period_start'),
  ]);
  if (invoices.error) throw new Error(`Reading invoices failed: ${invoices.error.message}`);
  if (amendments.error) throw new Error(`Reading lease amendments failed: ${amendments.error.message}`);
  return {
    leases: rows.map((row) => ({ ...row, tenant: row.tenant_party_id === null ? null : (tenants.get(row.tenant_party_id) ?? null) })),
    invoices: z.array(invoiceRowSchema).parse(invoices.data),
    amendments: z.array(leaseAmendmentRowSchema).parse(amendments.data),
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

export type HoldingLeases = { readonly leases: readonly LeaseRow[]; readonly amendments: readonly LeaseAmendmentRow[] };

/** The leases holding a unit on `asOf` with their amendments, across the household or on one property. */
export async function loadHoldingLeases(householdId: string, asOf: IsoDate, propertyId?: string): Promise<HoldingLeases> {
  const supabase = await createSessionClient();
  const scope = propertyId === undefined ? { household_id: householdId } : { household_id: householdId, property_id: propertyId };
  const leases = await supabase.from('leases').select(LEASE_COLUMNS).match(scope).in('status', ['active', 'terminated']);
  if (leases.error) throw new Error(`Reading leases failed: ${leases.error.message}`);
  const rows = z.array(leaseRowSchema).parse(leases.data).filter((row) => holdsUnit(row, asOf));
  if (rows.length === 0) return { leases: [], amendments: [] };
  const amendments = await supabase.from('lease_amendments').select(LEASE_AMENDMENT_COLUMNS).eq('household_id', householdId).order('effective_period_start');
  if (amendments.error) throw new Error(`Reading lease amendments failed: ${amendments.error.message}`);
  const ids = new Set(rows.map((row) => row.id));
  return { leases: rows, amendments: z.array(leaseAmendmentRowSchema).parse(amendments.data).filter((amendment) => ids.has(amendment.leaseId)) };
}
