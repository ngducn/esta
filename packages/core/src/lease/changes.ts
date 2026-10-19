import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { addDays, generateSchedule, scaleRoundHalfUp, validateAmendment, type Amendment, type LeaseTerms } from '../schedule';
import { currentMonthlyRent } from './monthlyRent';

/** SPEC §9.4 seed 7: a renewal's rent is rounded half up to this. `public.renew_lease` rounds the same way. */
export const RENEWAL_ROUNDING_VND: Vnd = vnd(100_000);

/** [app rule] `public.renew_lease` accepts a change from -50% to +100%. */
export const RENEWAL_INCREASE_BPS = { min: -5_000, max: 10_000 } as const;

/** The monthly rent of the lease's last period, after increases and amendments: what a renewal starts from. */
export function lastMonthlyRent(terms: LeaseTerms, amendments: readonly Amendment[]): Vnd {
  return currentMonthlyRent(terms, amendments, terms.endDate ?? terms.startDate);
}

/** The monthly rent a renewal starts at: the old lease's last monthly rent changed by `increaseBps`. */
export function renewalRent(lastRentVnd: Vnd, increaseBps: number): Vnd {
  return scaleRoundHalfUp(lastRentVnd, 10_000 + increaseBps, 10_000, RENEWAL_ROUNDING_VND);
}

/** A renewal starts the day after the old lease ends. */
export function renewalStart(terms: LeaseTerms): IsoDate | null {
  return terms.endDate === null ? null : addDays(terms.endDate, 1);
}

/**
 * The period starts a rent amendment may take effect from, up to `until`: after `asOf`, after everything already billed
 * (the latest issued invoice's end or the paid-through date), and accepted by `validateAmendment`. `public.amend_lease`
 * applies the same rules.
 */
export function amendmentStarts(
  terms: LeaseTerms,
  amendments: readonly Amendment[],
  asOf: IsoDate,
  billedThrough: IsoDate | null,
  until: IsoDate,
): IsoDate[] {
  const floor = [asOf, billedThrough, terms.paidThroughDate].reduce<IsoDate>((latest, date) => (date !== null && date > latest ? date : latest), asOf);
  return generateSchedule(terms, amendments, until)
    .filter((period) => period.start > floor)
    .filter((period) => validateAmendment(terms, amendments, { effectivePeriodStart: period.start, changes: { rentVnd: terms.rentVnd } }, asOf).ok)
    .map((period) => period.start);
}
