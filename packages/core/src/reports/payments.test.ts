import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { paymentBehavior, type DueInvoice, type InvoicePayment } from './payments';

const AS_OF = isoDate('2026-10-07');
const invoice = (id: string, leaseId: string, due: string, total = 1_000_000): DueInvoice => ({ id, leaseId, dueDate: isoDate(due), totalVnd: vnd(total) });
const paid = (invoiceId: string, on: string, amount = 1_000_000): InvoicePayment => ({ invoiceId, receivedOn: isoDate(on), amountVnd: vnd(amount) });
const tenants = new Map([
  ['lease-a', 'tenant-a'],
  ['lease-b', 'tenant-b'],
]);

describe('paymentBehavior', () => {
  it('counts an invoice late on the day its payments first cover it, not on its first payment', () => {
    const [row] = paymentBehavior([invoice('i1', 'lease-a', '2026-09-05')], [paid('i1', '2026-09-03', 400_000), paid('i1', '2026-09-12', 600_000)], tenants, AS_OF);
    expect(row).toEqual({ tenantId: 'tenant-a', invoiceCount: 1, paidLateCount: 1, averageDaysLate: 7, overdueCount: 0 });
  });

  it('treats a payment on the due date as on time and leaves out invoices not yet due and credits', () => {
    const rows = paymentBehavior(
      [invoice('i1', 'lease-a', '2026-09-05'), invoice('i2', 'lease-a', '2026-10-25'), invoice('i3', 'lease-a', '2026-08-05', -50_000)],
      [paid('i1', '2026-09-05')],
      tenants,
      AS_OF,
    );
    expect(rows).toEqual([{ tenantId: 'tenant-a', invoiceCount: 1, paidLateCount: 0, averageDaysLate: null, overdueCount: 0 }]);
  });

  it('counts an unpaid invoice past due as overdue, not as paid late', () => {
    const [row] = paymentBehavior([invoice('i1', 'lease-a', '2026-09-25')], [paid('i1', '2026-09-30', 500_000)], tenants, AS_OF);
    expect(row).toMatchObject({ paidLateCount: 0, overdueCount: 1 });
  });

  it('breaks a tie in late payments by the share of invoices paid late, then by the longer average', () => {
    const invoices = [invoice('a1', 'lease-a', '2026-08-05'), invoice('a2', 'lease-a', '2026-09-05'), invoice('b1', 'lease-b', '2026-09-05')];
    const payments = [paid('a1', '2026-08-06'), paid('a2', '2026-09-05'), paid('b1', '2026-09-06')];
    expect(paymentBehavior(invoices, payments, tenants, AS_OF).map((row) => row.tenantId)).toEqual(['tenant-b', 'tenant-a']);
    const sameShare = [invoice('a1', 'lease-a', '2026-09-05'), invoice('b1', 'lease-b', '2026-09-05')];
    expect(paymentBehavior(sameShare, [paid('a1', '2026-09-06'), paid('b1', '2026-09-15')], tenants, AS_OF).map((row) => row.tenantId)).toEqual(['tenant-b', 'tenant-a']);
  });
});
