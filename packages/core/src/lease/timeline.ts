import type { PaymentStatus } from '../allocation';
import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import type { SchedulePeriod } from '../schedule';

/** An invoice of the lease as `invoice_balances` reads it. */
export type TimelineInvoice = {
  readonly id: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  readonly status: 'draft' | 'issued' | 'void';
  readonly totalVnd: Vnd;
  readonly outstandingVnd: Vnd;
  readonly paymentStatus: PaymentStatus;
};

/**
 * Where one period stands on the Clock's date. `prepaid` is rent collected before Esta billed it (the lease's
 * paid-through date); `void` is a period whose bill was voided, which nothing bills again; `unbilled` is a past period with neither an invoice nor that date, which only an import can leave.
 */
export type PeriodMark =
  | { readonly kind: 'paid' }
  | { readonly kind: 'partial' }
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'due' }
  | { readonly kind: 'upcoming' }
  | { readonly kind: 'draft' }
  | { readonly kind: 'void' }
  | { readonly kind: 'prepaid' }
  | { readonly kind: 'unbilled' };

export type TimelineRow<I extends TimelineInvoice> = {
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly dueDate: IsoDate;
  readonly amountVnd: Vnd;
  readonly invoice: I | null;
  readonly mark: PeriodMark;
};

function invoiceMark(invoice: TimelineInvoice, asOf: IsoDate): PeriodMark {
  if (invoice.status === 'draft' || invoice.status === 'void') return { kind: invoice.status };
  if (invoice.outstandingVnd === 0) return { kind: 'paid' };
  if (invoice.dueDate < asOf) return { kind: 'overdue', days: daysBetween(invoice.dueDate, asOf) };
  if (invoice.paymentStatus === 'partial') return { kind: 'partial' };
  return invoice.dueDate === asOf ? { kind: 'due' } : { kind: 'upcoming' };
}

/**
 * Each scheduled period beside the invoice `lease_schedule` says bills it, if any. A paid-through date or a termination
 * can shorten the stretch an invoice bills, so its dates and total win over the schedule's.
 */
export function leaseTimeline<I extends TimelineInvoice>(periods: readonly SchedulePeriod[], invoices: readonly I[], asOf: IsoDate): TimelineRow<I>[] {
  return periods.map((period) => {
    const invoice = invoices.find((candidate) => candidate.id === period.invoiceId) ?? null;
    if (invoice !== null) {
      return { start: invoice.periodStart, end: invoice.periodEnd, dueDate: invoice.dueDate, amountVnd: invoice.totalVnd, invoice, mark: invoiceMark(invoice, asOf) };
    }
    const mark: PeriodMark = period.coveredByPaidThrough ? { kind: 'prepaid' } : period.end < asOf ? { kind: 'unbilled' } : { kind: 'upcoming' };
    return { start: period.start, end: period.end, dueDate: period.dueDate, amountVnd: period.rentVnd, invoice: null, mark };
  });
}
