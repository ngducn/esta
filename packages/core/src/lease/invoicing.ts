import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { addDays, addMonths, firstOfMonth, generateSchedule, scaleRoundHalfUp, type Amendment, type LeaseTerms, type Period } from '../schedule';
import type { UtilitiesMode } from './types';

/** SPEC §5.4: generation reaches every period that starts within this many days of the as-of date. */
export const GENERATION_HORIZON_DAYS = 35;

export type InvoicingLease = LeaseTerms & { readonly utilitiesMode: UtilitiesMode };

export type PlannedLine = { readonly kind: 'rent'; readonly quantity: 1; readonly unitPriceVnd: Vnd; readonly amountVnd: Vnd };

export type PlannedInvoice = {
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  /** The day the draft issues: the period start, or for owner-metered utilities the due date unless readings complete earlier. */
  readonly issueOn: IsoDate;
  readonly lines: readonly PlannedLine[];
};

/** The day every meter of the unit had its reading for `month` (the first of the consumption month). */
export type CompletedReadings = { readonly month: IsoDate; readonly completeOn: IsoDate };

type Billed = { readonly start: IsoDate; readonly end: IsoDate; readonly dueDate: IsoDate; readonly rentVnd: Vnd };

/**
 * What `paid_through_date` leaves of a period. A date inside it bills the days after it at the period's daily rate,
 * rounded as the schedule prorates. [app rule] A first period under `none` proration bills its full rent over its own
 * days, so its remainder uses those days.
 */
function uncollected(period: Period, paidThrough: IsoDate | null, dueOffsetDays: number): Billed | null {
  if (paidThrough === null || paidThrough < period.start) return period;
  if (paidThrough >= period.end) return null;
  const start = addDays(paidThrough, 1);
  const full = period.prorated ?? { fullPeriodVnd: period.rentVnd, daysInFullPeriod: daysBetween(period.start, period.end) + 1 };
  return {
    start,
    end: period.end,
    dueDate: addDays(start, dueOffsetDays),
    rentVnd: scaleRoundHalfUp(full.fullPeriodVnd, daysBetween(start, period.end) + 1, full.daysInFullPeriod, 1),
  };
}

/** LSE-4 bills month M's consumption on the period starting in month M+1, so only that period can issue early. */
function issueOn(lease: InvoicingLease, billed: Billed, readings: CompletedReadings | null): IsoDate {
  if (lease.utilitiesMode !== 'metered_by_owner') return billed.start;
  const billsReadings = readings !== null && firstOfMonth(billed.start) === addMonths(readings.month, 1);
  return billsReadings && readings.completeOn < billed.dueDate ? readings.completeOn : billed.dueDate;
}

/**
 * The drafts SPEC §5.4 generation owes on `asOf`: the period containing it and every period starting within the horizon,
 * less what `paid_through_date` covers. `readings` stays `null` until a unit has meters. `private.plan_invoices` in
 * the leases migration is the SQL twin that activation writes with; both must change together.
 */
export function planInvoices(lease: InvoicingLease, amendments: readonly Amendment[], asOf: IsoDate, readings: CompletedReadings | null = null): PlannedInvoice[] {
  const horizon = addDays(asOf, GENERATION_HORIZON_DAYS);
  return generateSchedule(lease, amendments, horizon)
    .filter((period) => period.end >= asOf)
    .flatMap((period) => {
      const billed = uncollected(period, lease.paidThroughDate, lease.dueOffsetDays);
      if (billed === null) return [];
      return [
        {
          periodStart: billed.start,
          periodEnd: billed.end,
          dueDate: billed.dueDate,
          issueOn: issueOn(lease, billed, readings),
          lines: [{ kind: 'rent', quantity: 1, unitPriceVnd: billed.rentVnd, amountVnd: billed.rentVnd }],
        },
      ];
    });
}
