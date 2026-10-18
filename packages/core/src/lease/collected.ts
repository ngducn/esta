import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { addDays } from '../schedule/dates';

/** An invoice as `invoice_balances` reads it: what it billed and what is still owed on it. */
export type BilledPeriod = {
  readonly status: 'draft' | 'issued' | 'void';
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly outstandingVnd: Vnd;
};

/**
 * `Đã thu đến` on a lease: `paid_through_date` covers what was collected before Esta, and each settled issued invoice
 * that follows it without a gap extends it to its period end. The first period still owed, or the first gap, ends it.
 */
export function collectedThrough(paidThroughDate: IsoDate | null, invoices: readonly BilledPeriod[]): IsoDate | null {
  let through = paidThroughDate;
  const billed = invoices.filter((invoice) => invoice.status === 'issued').toSorted((a, b) => a.periodStart.localeCompare(b.periodStart));
  for (const invoice of billed) {
    if (through !== null && invoice.periodEnd <= through) continue;
    if (through !== null && invoice.periodStart > addDays(through, 1)) break;
    if (invoice.outstandingVnd > 0) break;
    through = invoice.periodEnd;
  }
  return through;
}
