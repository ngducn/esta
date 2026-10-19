import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';

export type BillingCycleMonths = 1 | 3 | 6 | 12;

export type PeriodAnchor = 'lease_start' | 'calendar_month';

export type FirstPeriodProration = 'none' | 'by_days';

/** A lease's rent increase as the terms card shows it; `private.lease_periods` applies it, rounding included. */
export type Escalation =
  | { kind: 'none' }
  | { kind: 'percent'; valueBps: number; everyMonths: number }
  | { kind: 'fixed'; valueVnd: Vnd; everyMonths: number };

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
  /** After increases and amendments. */
  readonly monthlyRentVnd: Vnd;
  readonly rentVnd: Vnd;
  readonly coveredByPaidThrough: boolean;
  readonly invoiceId: string | null;
};
