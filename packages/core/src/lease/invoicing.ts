import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { addDays, addMonths, firstOfMonth, generateSchedule, type Amendment, type LeaseTerms, type Period } from '../schedule';
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

/** LSE-4 bills month M's consumption on the period starting in month M+1, so only that period can issue early. */
function issueOn(lease: InvoicingLease, period: Period, readings: CompletedReadings | null): IsoDate {
  if (lease.utilitiesMode !== 'metered_by_owner') return period.start;
  const billsReadings = readings !== null && firstOfMonth(period.start) === addMonths(readings.month, 1);
  return billsReadings && readings.completeOn < period.dueDate ? readings.completeOn : period.dueDate;
}

/**
 * The drafts SPEC §5.4 generation owes on `asOf`: the period containing it and every period starting within the horizon,
 * less the periods `paid_through_date` covers. `readings` stays `null` until a unit has meters.
 */
export function planInvoices(lease: InvoicingLease, amendments: readonly Amendment[], asOf: IsoDate, readings: CompletedReadings | null = null): PlannedInvoice[] {
  const horizon = addDays(asOf, GENERATION_HORIZON_DAYS);
  return generateSchedule(lease, amendments, horizon)
    .filter((period) => period.end >= asOf && !period.coveredByPaidThrough)
    .map((period) => ({
      periodStart: period.start,
      periodEnd: period.end,
      dueDate: period.dueDate,
      issueOn: issueOn(lease, period, readings),
      lines: [{ kind: 'rent', quantity: 1, unitPriceVnd: period.rentVnd, amountVnd: period.rentVnd }],
    }));
}
