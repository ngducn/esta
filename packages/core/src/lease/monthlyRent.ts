import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import type { SchedulePeriod } from '../schedule';

/**
 * The monthly rent of the lease's period that contains `asOf`, after increases and amendments, from its
 * `lease_schedule` periods; `null` before its first period, when the agreed rent applies.
 */
export function currentMonthlyRent(periods: readonly SchedulePeriod[], asOf: IsoDate): Vnd | null {
  return periods.findLast((period) => period.start <= asOf)?.monthlyRentVnd ?? null;
}
