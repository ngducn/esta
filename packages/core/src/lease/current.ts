import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { SchedulePeriod } from '../schedule';
import type { LeaseRow } from '../schemas/lease';
import { currentMonthlyRent } from './monthlyRent';
import type { LeaseStatus } from './types';

type LeaseSpan = { readonly status: LeaseStatus; readonly start_date: IsoDate | null; readonly end_date: IsoDate | null };

/**
 * SPEC §5.4: an active lease holds its unit until its end date has passed, a renewal signed early included, and a
 * terminated one until its termination date, which is its end date.
 */
export function holdsUnit(lease: LeaseSpan, asOf: IsoDate): boolean {
  return (lease.status === 'active' || lease.status === 'terminated') && (lease.end_date === null || asOf <= lease.end_date);
}

/** Holding its unit and started: a lease whose rent is owed on `asOf`. */
export function inEffect(lease: LeaseSpan, asOf: IsoDate): boolean {
  return holdsUnit(lease, asOf) && lease.start_date !== null && lease.start_date <= asOf;
}

/** The lease a unit shows on `asOf`: the earliest-starting one that holds it, else a draft. */
export function currentLease<L extends LeaseSpan>(leases: readonly L[], asOf: IsoDate): L | undefined {
  const holding = leases.filter((lease) => holdsUnit(lease, asOf)).toSorted((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  return holding[0] ?? leases.find((lease) => lease.status === 'draft');
}

/**
 * The monthly rent owed on `asOf` under the leases in effect, after escalation and amendments, from their
 * `lease_schedule` periods; `null` when none is.
 */
export function rentInEffect(leases: readonly LeaseRow[], schedule: readonly SchedulePeriod[], asOf: IsoDate): Vnd | null {
  const owed = leases.flatMap((lease) => {
    if (!inEffect(lease, asOf) || lease.rent_vnd === null) return [];
    return [currentMonthlyRent(schedule.filter((period) => period.leaseId === lease.id), asOf) ?? lease.rent_vnd];
  });
  return owed.length === 0 ? null : vnd(owed.reduce((sum, rent) => sum + rent, 0));
}
