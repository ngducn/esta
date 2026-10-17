import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';

export type BillingCycleMonths = 1 | 3 | 6 | 12;

export type PeriodAnchor = 'lease_start' | 'calendar_month';

export type FirstPeriodProration = 'none' | 'by_days';

export type Escalation =
  | { kind: 'none' }
  | { kind: 'percent'; valueBps: number; everyMonths: number; roundingVnd: Vnd }
  | { kind: 'fixed'; valueVnd: Vnd; everyMonths: number; roundingVnd: Vnd };

export type LeaseTerms = {
  startDate: IsoDate;
  endDate: IsoDate | null;
  /** Monthly rent. A full period bills it once per month of the billing cycle. */
  rentVnd: Vnd;
  billingCycleMonths: BillingCycleMonths;
  periodAnchor: PeriodAnchor;
  firstPeriodProration: FirstPeriodProration;
  dueOffsetDays: number;
  escalation: Escalation;
  paidThroughDate: IsoDate | null;
};

export type AmendmentChanges = {
  rentVnd?: Vnd;
  billingCycleMonths?: BillingCycleMonths;
};

export type Amendment = {
  effectivePeriodStart: IsoDate;
  changes: AmendmentChanges;
};

export type Proration = {
  days: number;
  daysInFullPeriod: number;
  fullPeriodVnd: Vnd;
};

export type Period = {
  start: IsoDate;
  end: IsoDate;
  dueDate: IsoDate;
  monthlyRentVnd: Vnd;
  rentVnd: Vnd;
  prorated: Proration | null;
  coveredByPaidThrough: boolean;
};

export type AmendmentRefusal = 'not_a_period_start' | 'not_after_as_of' | 'duplicate_effective_start' | 'moves_later_amendment';
