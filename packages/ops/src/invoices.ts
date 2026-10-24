import { PAYMENT_STATUSES, type PaymentStatus } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import type { Db } from './db';
import { readAll } from './kit';

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
  readonly allocatedVnd: Vnd;
  /** Still owed after allocated payments; an issued invoice with none left is settled. */
  readonly outstandingVnd: Vnd;
  readonly paymentStatus: PaymentStatus;
};

const money = z.number().int().min(0).transform(vnd);

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
    total_vnd: z.number().int().transform(vnd),
    allocated_vnd: money,
    outstanding_vnd: money,
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
      totalVnd: row.total_vnd,
      allocatedVnd: row.allocated_vnd,
      outstandingVnd: row.outstanding_vnd,
      paymentStatus: row.payment_status,
    }),
  );

const INVOICE_COLUMNS = 'id, lease_id, number, period_start, period_end, due_date, issue_on, status, total_vnd, allocated_vnd, outstanding_vnd, payment_status';

export type InvoiceScope =
  | { readonly leaseIds: readonly string[] }
  | { readonly issuedDueFrom: IsoDate; readonly issuedDueTo: IsoDate }
  | { readonly issuedOnOrBefore: IsoDate };

/** Invoices with their balances from `invoice_balances`, earliest period first: every one of these leases, the issued ones due in a range, or every one issued by a date. */
export async function readInvoices(db: Db, householdId: string, scope: InvoiceScope): Promise<InvoiceSummary[]> {
  if ('leaseIds' in scope && scope.leaseIds.length === 0) return [];
  const rows = await readAll('invoices', (from, to) => {
    const query = db.from('invoice_balances').select(INVOICE_COLUMNS).eq('household_id', householdId);
    const scoped =
      'leaseIds' in scope
        ? query.in('lease_id', [...scope.leaseIds])
        : 'issuedOnOrBefore' in scope
          ? query.eq('status', 'issued').lte('issue_on', scope.issuedOnOrBefore)
          : query.eq('status', 'issued').gte('due_date', scope.issuedDueFrom).lte('due_date', scope.issuedDueTo);
    return scoped.order('period_start').order('id').range(from, to);
  });
  return z.array(invoiceRowSchema).parse(rows);
}
