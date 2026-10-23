import { addDays, addMonths, firstOfMonth } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import type { ExpenseFact, IncomeFact } from '../ledger';
import type { BilledPeriod } from '../lease/collected';
import type { Vnd } from '../money/vnd';
import type { SchedulePeriod } from '../schedule';
import type { LeaseRow } from '../schemas/lease';

export type ReportProperty = { readonly id: string; readonly name: string };

/** An invoice with its balance, as `invoice_balances` reads it. */
export type ReportInvoice = BilledPeriod & {
  readonly leaseId: string;
  readonly dueDate: IsoDate;
  readonly totalVnd: Vnd;
  readonly allocatedVnd: Vnd;
};

export type ReportLease = LeaseRow & {
  readonly propertyName: string;
  readonly unitLabel: string;
  /** A whole unit is named by its property alone. */
  readonly wholeUnit: boolean;
  readonly tenantName: string | null;
  readonly depositHeldVnd: Vnd;
};

/** What the household's reports read for the period `from` to `to`, both inclusive, and the Clock's date `asOf`. */
export type ReportSnapshot = {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly asOf: IsoDate;
  readonly properties: readonly ReportProperty[];
  /** `allocation_facts` received in the period. */
  readonly incomes: readonly (IncomeFact & { readonly propertyId: string })[];
  /** Live expenses paid in the period. */
  readonly expenses: readonly (ExpenseFact & { readonly propertyId: string })[];
  /** Issued invoices due in the period on live properties. */
  readonly invoices: readonly ReportInvoice[];
  /** The leases in effect on `asOf` on live properties, each with every invoice and scheduled period it has. */
  readonly leases: readonly ReportLease[];
  readonly leaseInvoices: readonly ReportInvoice[];
  readonly schedule: readonly SchedulePeriod[];
};

/** A year's report period: the whole year, or through the end of the Clock's month in the current year. */
export function yearPeriod(year: number, today: IsoDate): { from: IsoDate; to: IsoDate } {
  const from = isoDate(`${year}-01-01`);
  return { from, to: today.startsWith(`${year}-`) ? addDays(addMonths(firstOfMonth(today), 1), -1) : isoDate(`${year}-12-31`) };
}

export function monthsOf(from: IsoDate, to: IsoDate): IsoDate[] {
  const months: IsoDate[] = [];
  for (let month = firstOfMonth(from); month <= to; month = addMonths(month, 1)) months.push(month);
  return months;
}
