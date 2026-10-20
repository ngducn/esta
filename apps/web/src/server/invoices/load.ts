import 'server-only';
import { PAYMENT_STATUSES, type PaymentStatus } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

const money = z.number().int().transform(vnd);
const owed = z.number().int().min(0).transform(vnd);

const lineSchema = z
  .object({
    kind: z.enum(['rent', 'electricity', 'water', 'recurring_charge', 'adjustment', 'other']),
    description: z.string().nullable(),
    quantity: z.number(),
    unit_price_vnd: money,
    amount_vnd: money,
    sort_order: z.number().int(),
  })
  .transform((line) => ({ kind: line.kind, description: line.description, quantity: line.quantity, unitPriceVnd: line.unit_price_vnd, amountVnd: line.amount_vnd, sortOrder: line.sort_order }));

export type InvoiceLine = z.output<typeof lineSchema>;

const invoiceSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  memo_code: z.string(),
  status: z.enum(['draft', 'issued', 'void']),
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  due_date: isoDateSchema,
  issue_on: isoDateSchema,
  voided_reason: z.string().nullable(),
  lease: z.object({
    id: z.uuid(),
    property_id: z.uuid(),
    unit: z.object({ label: z.string(), kind: z.string(), property: z.object({ nickname: z.string() }) }),
    tenant: z.object({ full_name: z.string() }).nullable(),
  }),
  lines: z.array(lineSchema),
});

const balanceSchema = z.object({ total_vnd: money, allocated_vnd: owed, outstanding_vnd: owed, payment_status: z.enum(PAYMENT_STATUSES) });

/** One bill as its page shows it (LSE-5): what it charges, what payments settled and what is still owed. */
export type InvoiceDetail = {
  readonly id: string;
  readonly number: string;
  readonly memoCode: string;
  readonly status: 'draft' | 'issued' | 'void';
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  readonly issueOn: IsoDate;
  readonly voidedReason: string | null;
  readonly leaseId: string;
  readonly propertyId: string;
  readonly propertyName: string;
  readonly unitLabel: string;
  readonly wholeUnit: boolean;
  readonly tenantName: string | null;
  readonly lines: readonly InvoiceLine[];
  readonly totalVnd: Vnd;
  readonly allocatedVnd: Vnd;
  readonly outstandingVnd: Vnd;
  readonly paymentStatus: PaymentStatus;
};

const INVOICE_SELECT =
  'id, number, memo_code, status, period_start, period_end, due_date, issue_on, voided_reason, ' +
  'lease:leases!invoices_household_id_lease_id_fkey(id, property_id, ' +
  'unit:units!leases_household_id_property_id_unit_id_fkey(label, kind, property:properties!units_household_id_property_id_fkey(nickname)), ' +
  'tenant:parties!leases_household_id_tenant_party_id_fkey(full_name)), ' +
  'lines:invoice_lines(kind, description, quantity, unit_price_vnd, amount_vnd, sort_order)';

/** The bill under RLS, or null when the member's household has no such bill. */
export async function loadInvoice(householdId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  const supabase = await createSessionClient();
  const [invoice, balance] = await Promise.all([
    supabase.from('invoices').select(INVOICE_SELECT).eq('household_id', householdId).eq('id', invoiceId).maybeSingle(),
    supabase.from('invoice_balances').select('total_vnd, allocated_vnd, outstanding_vnd, payment_status').eq('household_id', householdId).eq('id', invoiceId).maybeSingle(),
  ]);
  if (invoice.error) throw new Error(`Reading the invoice failed: ${invoice.error.message}`);
  if (balance.error) throw new Error(`Reading the invoice balance failed: ${balance.error.message}`);
  if (invoice.data === null || balance.data === null) return null;
  const row = invoiceSchema.parse(invoice.data);
  const totals = balanceSchema.parse(balance.data);
  return {
    id: row.id,
    number: row.number,
    memoCode: row.memo_code,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    issueOn: row.issue_on,
    voidedReason: row.voided_reason,
    leaseId: row.lease.id,
    propertyId: row.lease.property_id,
    propertyName: row.lease.unit.property.nickname,
    unitLabel: row.lease.unit.label,
    wholeUnit: row.lease.unit.kind === 'whole',
    tenantName: row.lease.tenant?.full_name ?? null,
    lines: row.lines.toSorted((a, b) => a.sortOrder - b.sortOrder),
    totalVnd: totals.total_vnd,
    allocatedVnd: totals.allocated_vnd,
    outstandingVnd: totals.outstanding_vnd,
    paymentStatus: totals.payment_status,
  };
}
