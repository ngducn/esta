import { addDays } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { scaleRoundHalfUp } from '../money/round';
import { vnd, type Vnd } from '../money/vnd';
import type { Amendment, SchedulePeriod } from '../schedule';

/** SPEC §9.4 seed 7: a renewal's rent is rounded half up to this. `public.renew_lease` rounds the same way. */
export const RENEWAL_ROUNDING_VND: Vnd = vnd(100_000);

/** [app rule] `public.renew_lease` accepts a change from -50% to +100%. */
export const RENEWAL_INCREASE_BPS = { min: -5_000, max: 10_000 } as const;

/** The monthly rent a renewal starts at: the old lease's last monthly rent changed by `increaseBps`. */
export function renewalRent(lastRentVnd: Vnd, increaseBps: number): Vnd {
  return scaleRoundHalfUp(lastRentVnd, 10_000 + increaseBps, 10_000, RENEWAL_ROUNDING_VND);
}

export function renewalStart(endDate: IsoDate | null): IsoDate | null {
  return endDate === null ? null : addDays(endDate, 1);
}

/**
 * The period starts of a lease's schedule a rent amendment may take effect from: after `asOf`, after everything already
 * billed (the latest issued invoice's end or the paid-through date), and not already taken by an amendment. A rent
 * change moves no period start, so every later amendment stays on one. `public.amend_lease` applies the same rules.
 */
export function amendmentStarts(
  periods: readonly SchedulePeriod[],
  amendments: readonly Amendment[],
  floors: { asOf: IsoDate; billedThrough: IsoDate | null; paidThrough: IsoDate | null },
): IsoDate[] {
  const floor = [floors.billedThrough, floors.paidThrough].reduce<IsoDate>((latest, date) => (date !== null && date > latest ? date : latest), floors.asOf);
  const taken = new Set(amendments.map((amendment) => amendment.effectivePeriodStart));
  return periods.filter((period) => period.start > floor && !taken.has(period.start)).map((period) => period.start);
}
