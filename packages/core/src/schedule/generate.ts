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
    ...cursor,
    cycle: billingCycleMonths ?? cursor.cycle,
    rent: rentVnd === undefined ? cursor.rent : { from: amendment.effectivePeriodStart, vnd: rentVnd },
  };
}

function byEffectiveStart(a: Amendment, b: Amendment): number {
  return a.effectivePeriodStart < b.effectivePeriodStart ? -1 : a.effectivePeriodStart > b.effectivePeriodStart ? 1 : 0;
}

type Draft = { periods: Period[]; stranded: Amendment | undefined };

function draftSchedule(terms: LeaseTerms, sorted: readonly Amendment[], until: IsoDate): Draft {
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
  const next = sorted[applied];
  return { periods, stranded: next !== undefined && next.effectivePeriodStart <= lastStart ? next : undefined };
}

/**
 * Every period of the lease whose start is on or before `until` (and the end date, when set).
 * An amendment applies from the period whose start equals its effective start. One that matches no
 * period start inside that range, or shares its start with another, breaks the invariant
 * `validateAmendment` guards and throws.
 */
export function generateSchedule(terms: LeaseTerms, amendments: readonly Amendment[], until: IsoDate): Period[] {
  const sorted = [...amendments].sort(byEffectiveStart);
  const shared = sorted.find((amendment, i) => sorted[i - 1]?.effectivePeriodStart === amendment.effectivePeriodStart);
  if (shared !== undefined) throw new RangeError(`Two amendments take effect on ${shared.effectivePeriodStart}`);
  const { periods, stranded } = draftSchedule(terms, sorted, until);
  if (stranded !== undefined) throw new RangeError(`Amendment effective ${stranded.effectivePeriodStart} matches no period start`);
  return periods;
}

/**
 * Accepts `amendment` beside the lease's existing `amendments` only from a period start after `asOf`
 * that no other amendment uses, and only when every later amendment still starts a period once it
 * applies. Returns the first period the amendment bills.
 */
export function validateAmendment(
  terms: LeaseTerms,
  amendments: readonly Amendment[],
  amendment: Amendment,
  asOf: IsoDate,
): Result<Period, AmendmentRefusal> {
  const effective = amendment.effectivePeriodStart;
  if (effective <= asOf) return { ok: false, reason: 'not_after_as_of' };
  if (amendments.some((other) => other.effectivePeriodStart === effective)) return { ok: false, reason: 'duplicate_effective_start' };
  const sorted = [...amendments, amendment].sort(byEffectiveStart);
  const { periods, stranded } = draftSchedule(terms, sorted, sorted.at(-1)?.effectivePeriodStart ?? effective);
  if (stranded !== undefined) {
    return { ok: false, reason: stranded.effectivePeriodStart === effective ? 'not_a_period_start' : 'moves_later_amendment' };
  }
  const period = periods.find((candidate) => candidate.start === effective);
  if (period === undefined) return { ok: false, reason: 'not_a_period_start' };
  return { ok: true, value: period };
}
