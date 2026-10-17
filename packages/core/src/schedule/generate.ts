import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { Result } from '../result';
import { addDays, addMonths, firstOfMonth } from './dates';
import { escalate, escalationSteps } from './escalation';
import { scaleRoundHalfUp } from './rounding';
import type { Amendment, AmendmentRefusal, BillingCycleMonths, LeaseTerms, Period } from './types';

type Cursor = {
  offsetMonths: number;
  cycle: BillingCycleMonths;
  rent: { from: IsoDate; vnd: Vnd };
};

function amend(cursor: Cursor, amendment: Amendment): Cursor {
  const { rentVnd, billingCycleMonths } = amendment.changes;
  return {
    offsetMonths: cursor.offsetMonths,
    cycle: billingCycleMonths ?? cursor.cycle,
    rent: rentVnd === undefined ? cursor.rent : { from: amendment.effectivePeriodStart, vnd: rentVnd },
  };
}

function byEffectiveStart(a: Amendment, b: Amendment): number {
  return a.effectivePeriodStart < b.effectivePeriodStart ? -1 : a.effectivePeriodStart > b.effectivePeriodStart ? 1 : 0;
}

/**
 * Every period of the lease whose start is on or before `until` (and the end date, when set).
 * An amendment applies from the period whose start equals its effective start; one that matches
 * no period start inside that range breaks the invariant `validateAmendment` guards and throws.
 */
export function generateSchedule(terms: LeaseTerms, amendments: readonly Amendment[], until: IsoDate): Period[] {
  const sorted = [...amendments].sort(byEffectiveStart);
  const lastStart = terms.endDate !== null && terms.endDate < until ? terms.endDate : until;
  const periods: Period[] = [];
  const origin = terms.periodAnchor === 'lease_start' ? terms.startDate : firstOfMonth(terms.startDate);
  let cursor: Cursor = {
    offsetMonths: 0,
    cycle: terms.billingCycleMonths,
    rent: { from: terms.startDate, vnd: terms.rentVnd },
  };
  let applied = 0;
  let fullStart = origin;
  let start = terms.startDate;
  while (start <= lastStart) {
    for (let next = sorted[applied]; next !== undefined && next.effectivePeriodStart === start; next = sorted[applied]) {
      cursor = amend(cursor, next);
      applied += 1;
    }
    const naturalEnd = addDays(addMonths(origin, cursor.offsetMonths + cursor.cycle), -1);
    const end = terms.endDate !== null && terms.endDate < naturalEnd ? terms.endDate : naturalEnd;
    const chargeStart = terms.firstPeriodProration === 'none' && end === naturalEnd ? fullStart : start;
    const daysInFullPeriod = daysBetween(fullStart, naturalEnd) + 1;
    const days = daysBetween(chargeStart, end) + 1;
    const steps =
      escalationSteps(terms.escalation, terms.startDate, start) -
      escalationSteps(terms.escalation, terms.startDate, cursor.rent.from);
    const monthlyRentVnd = escalate(cursor.rent.vnd, terms.escalation, steps);
    const fullPeriodVnd = vnd(monthlyRentVnd * cursor.cycle);
    const prorated = days < daysInFullPeriod ? { days, daysInFullPeriod, fullPeriodVnd } : null;
    periods.push({
      start,
      end,
      dueDate: addDays(start, terms.dueOffsetDays),
      monthlyRentVnd,
      rentVnd: prorated === null ? fullPeriodVnd : scaleRoundHalfUp(monthlyRentVnd, cursor.cycle * days, daysInFullPeriod, 1),
      prorated,
      coveredByPaidThrough: terms.paidThroughDate !== null && end <= terms.paidThroughDate,
    });
    cursor = { ...cursor, offsetMonths: cursor.offsetMonths + cursor.cycle };
    fullStart = addMonths(origin, cursor.offsetMonths);
    start = fullStart;
  }
  const unapplied = sorted[applied];
  if (unapplied !== undefined && unapplied.effectivePeriodStart <= lastStart) {
    throw new RangeError(`Amendment effective ${unapplied.effectivePeriodStart} matches no period start`);
  }
  return periods;
}

/** Accepts an amendment only from a generated period start after `asOf`, and returns that period. */
export function validateAmendment(
  schedule: readonly Period[],
  amendment: Amendment,
  asOf: IsoDate,
): Result<Period, AmendmentRefusal> {
  if (amendment.effectivePeriodStart <= asOf) return { ok: false, reason: 'not_after_as_of' };
  const period = schedule.find((candidate) => candidate.start === amendment.effectivePeriodStart);
  if (period === undefined) return { ok: false, reason: 'not_a_period_start' };
  return { ok: true, value: period };
}
