import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';

export type DueInvoice = { readonly id: string; readonly leaseId: string; readonly dueDate: IsoDate; readonly totalVnd: Vnd };
export type InvoicePayment = { readonly invoiceId: string; readonly receivedOn: IsoDate; readonly amountVnd: Vnd };

export type PaymentBehavior = {
  readonly tenantId: string;
  readonly invoiceCount: number;
  /** Invoices fully allocated after their due date. */
  readonly paidLateCount: number;
  /** Over the invoices paid late, rounded half up; null when none was. */
  readonly averageDaysLate: number | null;
  /** Invoices still not fully allocated after their due date on `asOf`. */
  readonly overdueCount: number;
};

/** The day the payments allocated to an invoice first cover its total, or null while they do not. */
function paidOn(invoice: DueInvoice, payments: readonly InvoicePayment[]): IsoDate | null {
  let covered = 0;
  for (const payment of payments.toSorted((a, b) => a.receivedOn.localeCompare(b.receivedOn))) {
    covered += payment.amountVnd;
    if (covered >= invoice.totalVnd) return payment.receivedOn;
  }
  return null;
}

/**
 * AGENT.md §4 `payment_behavior`: per tenant, over the issued invoices due by `asOf`, how many were paid late and by how
 * many days on average. The tenant who paid late most often comes first; a tie goes to the larger share of their
 * invoices paid late, then the longer average. An invoice that charges nothing is never late.
 */
export function paymentBehavior(invoices: readonly DueInvoice[], payments: readonly InvoicePayment[], tenantOf: ReadonlyMap<string, string>, asOf: IsoDate): PaymentBehavior[] {
  const byInvoice = new Map<string, InvoicePayment[]>();
  for (const payment of payments) byInvoice.set(payment.invoiceId, [...(byInvoice.get(payment.invoiceId) ?? []), payment]);
  const byTenant = new Map<string, { invoices: number; late: number[]; overdue: number }>();
  for (const invoice of invoices) {
    const tenantId = tenantOf.get(invoice.leaseId);
    if (tenantId === undefined || invoice.dueDate > asOf || invoice.totalVnd <= 0) continue;
    const tally = byTenant.get(tenantId) ?? { invoices: 0, late: [], overdue: 0 };
    const paid = paidOn(invoice, byInvoice.get(invoice.id) ?? []);
    tally.invoices += 1;
    if (paid !== null && paid > invoice.dueDate) tally.late.push(daysBetween(invoice.dueDate, paid));
    if (paid === null && invoice.dueDate < asOf) tally.overdue += 1;
    byTenant.set(tenantId, tally);
  }
  const sum = (days: readonly number[]) => days.reduce((total, day) => total + day, 0);
  const share = (tally: { invoices: number; late: number[] }) => tally.late.length / tally.invoices;
  const average = (tally: { late: number[] }) => (tally.late.length === 0 ? 0 : sum(tally.late) / tally.late.length);
  return [...byTenant]
    .toSorted(([a, x], [b, y]) => y.late.length - x.late.length || share(y) - share(x) || average(y) - average(x) || a.localeCompare(b))
    .map(([tenantId, tally]) => ({
      tenantId,
      invoiceCount: tally.invoices,
      paidLateCount: tally.late.length,
      averageDaysLate: tally.late.length === 0 ? null : Math.round(average(tally)),
      overdueCount: tally.overdue,
    }));
}
