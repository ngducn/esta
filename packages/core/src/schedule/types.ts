import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';

export type BillingCycleMonths = 1 | 3 | 6 | 12;

export type PeriodAnchor = 'lease_start' | 'calendar_month';

export type FirstPeriodProration = 'none' | 'by_days';

export type Escalation =
  | { kind: 'none' }
  | { kind: 'percent'; valueBps: number; everyMonths: number; roundingVnd: Vnd }
  | { kind: 'fixed'; valueVnd: Vnd; everyMonths: number; roundingVnd: Vnd };

export type AmendmentChanges = {
  rentVnd?: Vnd;
  billingCycleMonths?: BillingCycleMonths;
};

export type Amendment = {
  effectivePeriodStart: IsoDate;
  changes: AmendmentChanges;
};

/** One period of a lease as `public.lease_schedule` plans it, with the live invoice that bills it. */
export type SchedulePeriod = {
  readonly leaseId: string;
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly dueDate: IsoDate;
  readonly cycleMonths: BillingCycleMonths;
  /** After increases and amendments. */
  readonly monthlyRentVnd: Vnd;
  readonly rentVnd: Vnd;
  readonly prorated: boolean;
  readonly coveredByPaidThrough: boolean;
  readonly invoiceId: string | null;
};
