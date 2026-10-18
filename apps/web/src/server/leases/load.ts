import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { LEASE_COLUMNS, leaseRowSchema, type LeaseRow } from '@esta/core/schemas/lease';
import { vnd, type Vnd } from '@esta/core/money';
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
};

export type LeaseWithTenant = LeaseRow & { readonly tenant: Tenant | null };

export type PropertyLeases = {
  readonly leases: readonly LeaseWithTenant[];
  readonly invoices: readonly InvoiceSummary[];
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
    invoice_lines: z.array(z.object({ amount_vnd: z.number().int() })),
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
      totalVnd: vnd(row.invoice_lines.reduce((sum, line) => sum + line.amount_vnd, 0)),
    }),
  );

const tenantRowSchema = z
  .object({ id: z.uuid(), full_name: z.string(), phone: z.string().nullable() })
  .transform((row): Tenant => ({ id: row.id, fullName: row.full_name, phone: row.phone }));

const INVOICE_COLUMNS = 'id, lease_id, number, period_start, period_end, due_date, issue_on, status, invoice_lines(amount_vnd)';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

async function readTenants(supabase: SessionClient, householdId: string, ids: readonly string[]): Promise<Map<string, Tenant>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('parties').select('id, full_name, phone').eq('household_id', householdId).in('id', [...new Set(ids)]);
  if (error) throw new Error(`Reading tenants failed: ${error.message}`);
  return new Map(z.array(tenantRowSchema).parse(data).map((tenant) => [tenant.id, tenant]));
}

/** Every lease of the property with its tenant, and every invoice of those leases. RLS scopes both to the member. */
export const loadPropertyLeases = cache(async (propertyId: string): Promise<PropertyLeases> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: propertyId };
  const { data, error } = await supabase.from('leases').select(LEASE_COLUMNS).match(scope).order('start_date', { nullsFirst: false }).order('id');
  if (error) throw new Error(`Reading leases failed: ${error.message}`);
  const rows = z.array(leaseRowSchema).parse(data);
  const ids = rows.map((row) => row.id);
  const [tenants, invoices] = await Promise.all([
    readTenants(supabase, member.household.id, rows.flatMap((row) => (row.tenant_party_id === null ? [] : [row.tenant_party_id]))),
    ids.length === 0
      ? { data: [], error: null }
      : supabase.from('invoices').select(INVOICE_COLUMNS).eq('household_id', member.household.id).in('lease_id', ids).order('period_start'),
  ]);
  if (invoices.error) throw new Error(`Reading invoices failed: ${invoices.error.message}`);
  return {
    leases: rows.map((row) => ({ ...row, tenant: row.tenant_party_id === null ? null : (tenants.get(row.tenant_party_id) ?? null) })),
    invoices: z.array(invoiceRowSchema).parse(invoices.data),
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

/** Active leases of the household by property, for the list's monthly rent. */
export async function loadActiveLeases(householdId: string): Promise<LeaseRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('leases').select(LEASE_COLUMNS).eq('household_id', householdId).eq('status', 'active');
  if (error) throw new Error(`Reading active leases failed: ${error.message}`);
  return z.array(leaseRowSchema).parse(data);
}
