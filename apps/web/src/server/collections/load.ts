import 'server-only';
import { openInvoicesOldestFirst, PAYMENT_STATUSES, type OpenInvoice } from '@esta/core/allocation';
import { collectionState, worstCollectionState, type CollectionCandidate, type CollectionState } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { firstOfMonth } from '@esta/core/date/calendar';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type CollectionRow = CollectionCandidate & {
  /** A whole unit is named by its property alone. */
  readonly wholeUnit: boolean;
  /** The property was archived while this bill was still owed; its pages are gone, so the row links nowhere. */
  readonly propertyArchived: boolean;
  readonly leaseId: string;
  readonly tenantName: string | null;
  readonly number: string;
};

const money = z.number().int().min(0).transform(vnd);

const candidateSchema = z
  .object({
    invoice_id: z.uuid(),
    property_id: z.uuid(),
    property_nickname: z.string(),
    property_archived: z.boolean(),
    unit_label: z.string(),
    unit_kind: z.string(),
    lease_id: z.uuid(),
    tenant_name: z.string().nullable(),
    number: z.string(),
    due_date: isoDateSchema,
    total_vnd: z.number().int().transform(vnd),
    allocated_vnd: money,
    outstanding_vnd: money,
    payment_status: z.enum(PAYMENT_STATUSES),
  })
  .transform(
    (row): CollectionRow => ({
      invoiceId: row.invoice_id,
      propertyId: row.property_id,
      propertyName: row.property_nickname,
      unitLabel: row.unit_label,
      wholeUnit: row.unit_kind === 'whole',
      propertyArchived: row.property_archived,
      leaseId: row.lease_id,
      tenantName: row.tenant_name,
      number: row.number,
      dueDate: row.due_date,
      totalVnd: row.total_vnd,
      allocatedVnd: row.allocated_vnd,
      outstandingVnd: row.outstanding_vnd,
      paymentStatus: row.payment_status,
    }),
  );

/** LSE-10's rows for `month`. RLS limits them to the member's households; the household filter keeps a member of two to one. */
export async function loadCollectionRows(householdId: string, month: IsoDate, propertyId?: string): Promise<CollectionRow[]> {
  const supabase = await createSessionClient();
  let query = supabase.rpc('collection_candidates', { p_month: month }).eq('household_id', householdId);
  if (propertyId !== undefined) query = query.eq('property_id', propertyId);
  const { data, error } = await query;
  if (error) throw new Error(`Reading the collections board failed: ${error.message}`);
  return z.array(candidateSchema).parse(data);
}

/**
 * Each property's worst state on the board for the Clock's month, for its status pill. The pill only adds to the list
 * and the property tabs, so a failed read leaves them without it instead of failing them.
 */
export async function loadCollectionStates(householdId: string, asOf: IsoDate, propertyId?: string): Promise<Map<string, CollectionState>> {
  const rows = await loadCollectionRows(householdId, firstOfMonth(asOf), propertyId).catch((error: unknown) => {
    console.error(error);
    return [];
  });
  const byProperty = new Map<string, CollectionState[]>();
  for (const row of rows) {
    byProperty.set(row.propertyId, [...(byProperty.get(row.propertyId) ?? []), collectionState(row, asOf)]);
  }
  return new Map(
    [...byProperty].flatMap(([id, states]) => {
      const worst = worstCollectionState(states);
      return worst === null ? [] : [[id, worst] as const];
    }),
  );
}

/** An invoice a payment from the board may settle. */
export type PaymentInvoice = OpenInvoice & { readonly leaseId: string };

const invoiceSchema = z
  .object({ id: z.uuid(), lease_id: z.uuid(), due_date: isoDateSchema, period_start: isoDateSchema, status: z.string(), outstanding_vnd: money })
  .transform((row) => ({
    id: row.id,
    leaseId: row.lease_id,
    dueDate: row.due_date,
    periodStart: row.period_start,
    status: row.status,
    outstandingVnd: row.outstanding_vnd,
  }));

/**
 * Every invoice `openInvoicesOldestFirst` counts as still owed, grouped by lease: what `record_payment` settles, in its
 * order. Paid invoices, nearly all of a household's history, never count, so the read leaves them behind instead of
 * growing with every month toward PostgREST's 1,000-row cap.
 */
export async function loadOpenInvoices(householdId: string): Promise<Map<string, PaymentInvoice[]>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('invoice_balances')
    .select('id, lease_id, due_date, period_start, status, outstanding_vnd')
    .eq('household_id', householdId)
    .gt('outstanding_vnd', 0);
  if (error) throw new Error(`Reading the open invoices failed: ${error.message}`);
  const byLease = new Map<string, PaymentInvoice[]>();
  for (const invoice of openInvoicesOldestFirst(z.array(invoiceSchema).parse(data))) byLease.set(invoice.leaseId, [...(byLease.get(invoice.leaseId) ?? []), invoice]);
  return byLease;
}

/** What the board's row actions need of a bill still owed beyond its row: its memo code, share link and tenant contact. */
export type OwedBill = {
  readonly memoCode: string;
  /** Null only for a bill that is not issued, which the board never lists. */
  readonly shareToken: string | null;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly tenant: { readonly kind: 'individual' | 'organization'; readonly phone: string | null; readonly zaloPhone: string | null } | null;
};

const owedBillSchema = z
  .object({
    id: z.uuid(),
    memo_code: z.string(),
    share_token: z.string().nullable(),
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    lease: z.object({ tenant: z.object({ kind: z.enum(['individual', 'organization']), phone: z.string().nullable(), zalo_phone: z.string().nullable() }).nullable() }),
  })
  .transform((row): [string, OwedBill] => [
    row.id,
    {
      memoCode: row.memo_code,
      shareToken: row.share_token,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      tenant: row.lease.tenant === null ? null : { kind: row.lease.tenant.kind, phone: row.lease.tenant.phone, zaloPhone: row.lease.tenant.zalo_phone },
    },
  ]);

/** One read for every board row still owed, for `Mã QR` and `Nhắc qua Zalo`. */
export async function loadOwedBills(householdId: string, rows: readonly CollectionRow[]): Promise<Map<string, OwedBill>> {
  const owed = rows.filter((row) => row.outstandingVnd > 0);
  if (owed.length === 0) return new Map();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('id, memo_code, share_token, period_start, period_end, lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(kind, phone, zalo_phone))')
    .eq('household_id', householdId)
    .in('id', owed.map((row) => row.invoiceId));
  if (error) throw new Error(`Reading the owed bills failed: ${error.message}`);
  return new Map(z.array(owedBillSchema).parse(data));
}
