import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { generateSchedule, type Amendment, type LeaseTerms } from '../schedule';

/**
 * The monthly rent of the period that contains `asOf`, after escalation and amendments. Before the lease starts it is
 * the agreed rent; after it ends it is the last period's rent.
 */
export function currentMonthlyRent(lease: LeaseTerms, amendments: readonly Amendment[], asOf: IsoDate): Vnd {
  return generateSchedule(lease, amendments, asOf).at(-1)?.monthlyRentVnd ?? lease.rentVnd;
}
