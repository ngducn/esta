import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { addDays, addMonths } from './dates';
import { generateSchedule } from './generate';
import type { Amendment, BillingCycleMonths, Escalation, LeaseTerms, Period } from './types';

const params = { seed: 20261007, numRuns: 1000 };

const date = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => isoDate(d.toISOString().slice(0, 10)));
const cycle = fc.constantFrom<BillingCycleMonths>(1, 3, 6, 12);
const rent = fc.integer({ min: 1, max: 1_000_000_000_000 }).map(vnd);
const rounding = fc.constantFrom(1, 1_000, 100_000).map(vnd);
const everyMonths = fc.constantFrom(6, 12, 24, 36);
const escalation: fc.Arbitrary<Escalation> = fc.oneof(
  fc.constant<Escalation>({ kind: 'none' }),
  fc.record({ kind: fc.constant('percent' as const), valueBps: fc.integer({ min: 0, max: 5_000 }), everyMonths, roundingVnd: rounding }),
  fc.record({ kind: fc.constant('fixed' as const), valueVnd: fc.integer({ min: 0, max: 50_000_000 }).map(vnd), everyMonths, roundingVnd: rounding }),
);

const terms: fc.Arbitrary<LeaseTerms> = fc
  .record({
    startDate: date,
    endAfterDays: fc.option(fc.integer({ min: 0, max: 1_500 }), { nil: null }),
    rentVnd: rent,
    billingCycleMonths: cycle,
    periodAnchor: fc.constantFrom('lease_start' as const, 'calendar_month' as const),
    firstPeriodProration: fc.constantFrom('none' as const, 'by_days' as const),
    dueOffsetDays: fc.integer({ min: -10, max: 10 }),
    escalation,
    paidThroughAfterDays: fc.option(fc.integer({ min: -30, max: 800 }), { nil: null }),
  })
  .map(({ endAfterDays, paidThroughAfterDays, ...rest }) => ({
    ...rest,
    endDate: endAfterDays === null ? null : addDays(rest.startDate, endAfterDays),
    paidThroughDate: paidThroughAfterDays === null ? null : addDays(rest.startDate, paidThroughAfterDays),
  }));

const termsAndUntil = fc.tuple(terms, fc.integer({ min: -30, max: 2_000 })).map(([t, days]) => ({ terms: t, until: addDays(t.startDate, days) }));

type Day = { y: number; m: number; d: number };

const toDay = (text: string): Day => ({ y: Number(text.slice(0, 4)), m: Number(text.slice(5, 7)), d: Number(text.slice(8, 10)) });
const toText = ({ y, m, d }: Day): string => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lengthOfMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const tomorrow = ({ y, m, d }: Day): Day =>
  d < lengthOfMonth(y, m) ? { y, m, d: d + 1 } : m < 12 ? { y, m: m + 1, d: 1 } : { y: y + 1, m: 1, d: 1 };
const monthNumber = ({ y, m }: Day): number => y * 12 + m;

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
}

type ReferencePeriod = { start: string; end: string; rentVnd: number };

/**
 * A deliberately naive schedule that walks the lease one day at a time and shares no code with the generator:
 * a day starts a period when it sits a whole number of cycles after the segment's month on the anchor day.
 */
function referenceSchedule(t: LeaseTerms, amendments: readonly Amendment[], until: string): ReferencePeriod[] {
  const leaseStart = toDay(t.startDate);
  const anchorDay = t.periodAnchor === 'calendar_month' ? 1 : leaseStart.d;
  const lastStart = t.endDate !== null && t.endDate < until ? t.endDate : until;
  const escalation = t.escalation;
  let segmentMonth = monthNumber(leaseStart);
  let cycle: number = t.billingCycleMonths;
  let base: { from: string; monthlyVnd: bigint } = { from: t.startDate, monthlyVnd: BigInt(t.rentVnd) };

  const startsPeriod = (day: Day): boolean => {
    const months = monthNumber(day) - segmentMonth;
    return months > 0 && months % cycle === 0 && day.d === Math.min(anchorDay, lengthOfMonth(day.y, day.m));
  };
  const anniversariesUpTo = (date: string): number => {
    if (escalation.kind === 'none') return 0;
    for (let k = 1; ; k += 1) {
      const month = leaseStart.y * 12 + leaseStart.m - 1 + k * escalation.everyMonths;
      const y = Math.floor(month / 12);
      const m = (month % 12) + 1;
      if (toText({ y, m, d: Math.min(leaseStart.d, lengthOfMonth(y, m)) }) > date) return k - 1;
    }
  };
  const monthlyRentAt = (date: string): bigint => {
    let rent = base.monthlyVnd;
    for (let step = anniversariesUpTo(base.from); step < anniversariesUpTo(date); step += 1) {
      if (escalation.kind === 'percent') {
        rent = roundHalfUp(rent * BigInt(10_000 + escalation.valueBps), 10_000n * BigInt(escalation.roundingVnd)) * BigInt(escalation.roundingVnd);
      } else if (escalation.kind === 'fixed') {
        rent = roundHalfUp(rent + BigInt(escalation.valueVnd), BigInt(escalation.roundingVnd)) * BigInt(escalation.roundingVnd);
      }
    }
    return rent;
  };

  const periods: ReferencePeriod[] = [];
  for (let start = leaseStart; toText(start) <= lastStart; ) {
    const startText = toText(start);
    for (const amendment of amendments.filter((a) => a.effectivePeriodStart === startText)) {
      if (amendment.changes.rentVnd !== undefined) base = { from: startText, monthlyVnd: BigInt(amendment.changes.rentVnd) };
      if (amendment.changes.billingCycleMonths !== undefined) {
        segmentMonth = monthNumber(start);
        cycle = amendment.changes.billingCycleMonths;
      }
    }
    let naturalDays = 0;
    let leaseDays = 0;
    let last = start;
    let day = start;
    do {
      naturalDays += 1;
      if (t.endDate === null || toText(day) <= t.endDate) {
        leaseDays += 1;
        last = day;
      }
      day = tomorrow(day);
    } while (!startsPeriod(day));
    const fullDays = periods.length === 0 && t.periodAnchor === 'calendar_month' ? naturalDays + start.d - 1 : naturalDays;
    const billedDays = leaseDays < naturalDays || t.firstPeriodProration === 'by_days' ? leaseDays : fullDays;
    const fullPeriodVnd = monthlyRentAt(startText) * BigInt(cycle);
    const rentVnd = billedDays === fullDays ? fullPeriodVnd : roundHalfUp(fullPeriodVnd * BigInt(billedDays), BigInt(fullDays));
    periods.push({ start: startText, end: toText(last), rentVnd: Number(rentVnd) });
    start = day;
  }
  return periods;
}

const amendmentPlans = fc.array(
  fc.record({ pick: fc.nat(), rentVnd: fc.option(rent, { nil: null }), billingCycleMonths: fc.option(cycle, { nil: null }) }),
  { maxLength: 3 },
);

type AmendmentPlan = { pick: number; rentVnd: Vnd | null; billingCycleMonths: BillingCycleMonths | null };

function placeAmendments(t: LeaseTerms, until: string, plans: readonly AmendmentPlan[]): Amendment[] {
  const amendments: Amendment[] = [];
  for (const plan of plans) {
    const after = amendments.at(-1)?.effectivePeriodStart ?? t.startDate;
    const starts = referenceSchedule(t, amendments, until)
      .map((p) => p.start)
      .filter((start) => start > after);
    const effectivePeriodStart = starts[plan.pick % Math.max(starts.length, 1)];
    if (effectivePeriodStart === undefined) break;
    amendments.push({
      effectivePeriodStart: isoDate(effectivePeriodStart),
      changes: {
        ...(plan.rentVnd === null ? {} : { rentVnd: plan.rentVnd }),
        ...(plan.billingCycleMonths === null ? {} : { billingCycleMonths: plan.billingCycleMonths }),
      },
    });
  }
  return amendments;
}

const total = (periods: readonly { rentVnd: number }[]): number => periods.reduce((sum, p) => sum + p.rentVnd, 0);

function prorateOracle(rentVnd: number, days: number, fullDays: number): number {
  return Number((2n * BigInt(rentVnd) * BigInt(days) + BigInt(fullDays)) / (2n * BigInt(fullDays)));
}

function expectTiling(periods: readonly Period[], t: LeaseTerms, until: string): void {
  const lastStart = t.endDate !== null && t.endDate < until ? t.endDate : until;
  if (t.startDate > lastStart) {
    expect(periods).toEqual([]);
    return;
  }
  expect(periods[0]?.start).toBe(t.startDate);
  for (const [i, p] of periods.entries()) {
    expect(p.end >= p.start).toBe(true);
    expect(p.start <= lastStart).toBe(true);
    const next = periods[i + 1];
    if (next !== undefined) expect(next.start).toBe(addDays(p.end, 1));
  }
  const last = periods.at(-1);
  if (last === undefined) throw new Error('no periods');
  if (t.endDate !== null && t.endDate <= until) expect(last.end).toBe(t.endDate);
  else expect(addDays(last.end, 1) > until).toBe(true);
}

describe('generateSchedule properties', () => {
  it('tiles the lease from its start with no gap and no overlap, up to until or the end date', () => {
    fc.assert(
      fc.property(termsAndUntil, ({ terms: t, until }) => {
        expectTiling(generateSchedule(t, [], until), t, until);
      }),
      params,
    );
  });

  it('returns integer VND, never negative, and prorates below the full rent by the stated days', () => {
    fc.assert(
      fc.property(termsAndUntil, ({ terms: t, until }) => {
        for (const p of generateSchedule(t, [], until)) {
          expect(Number.isSafeInteger(p.rentVnd)).toBe(true);
          expect(p.rentVnd).toBeGreaterThanOrEqual(0);
          expect(p.dueDate).toBe(addDays(p.start, t.dueOffsetDays));
          expect(p.coveredByPaidThrough).toBe(t.paidThroughDate !== null && p.end <= t.paidThroughDate);
          if (p.prorated === null) continue;
          expect(p.prorated.days).toBeGreaterThanOrEqual(1);
          expect(p.prorated.days).toBeLessThan(p.prorated.daysInFullPeriod);
          expect(p.rentVnd).toBeLessThanOrEqual(p.prorated.fullPeriodVnd);
          expect(p.rentVnd).toBe(prorateOracle(p.prorated.fullPeriodVnd, p.prorated.days, p.prorated.daysInFullPeriod));
        }
      }),
      params,
    );
  });

  it('bills every period as the day-by-day reference does, so the total is monthly rent times months adjusted for proration, escalation and amendments (LSE-3)', () => {
    fc.assert(
      fc.property(termsAndUntil, amendmentPlans, ({ terms: t, until }, plans) => {
        const amendments = placeAmendments(t, until, plans);
        const expected = referenceSchedule(t, amendments, until);
        const actual = generateSchedule(t, amendments, until);
        expect(actual.map(({ start, end, rentVnd }) => ({ start, end, rentVnd }))).toEqual(expected);
        expect(total(actual)).toBe(total(expected));
      }),
      params,
    );
  });

  it('is deterministic and a shorter until yields a prefix of a longer one', () => {
    fc.assert(
      fc.property(fc.tuple(terms, fc.integer({ min: -30, max: 2_000 }), fc.integer({ min: 0, max: 500 })), ([t, days, extra]) => {
        const shorter = addDays(t.startDate, days);
        const longer = addDays(shorter, extra);
        const once = generateSchedule(t, [], shorter);
        expect(generateSchedule(t, [], shorter)).toEqual(once);
        expect(generateSchedule(t, [], longer).slice(0, once.length)).toEqual(once);
      }),
      params,
    );
  });

  it('leaves every period before an amendment identical and applies it from its period start', () => {
    const scenario = fc
      .tuple(terms, fc.integer({ min: 30, max: 2_000 }), fc.nat(), fc.option(rent, { nil: null }), fc.option(cycle, { nil: null }))
      .map(([t, days, pick, newRent, newCycle]) => ({ t: { ...t, endDate: null }, until: addDays(t.startDate, days), pick, newRent, newCycle }));
    fc.assert(
      fc.property(scenario, ({ t, until, pick, newRent, newCycle }) => {
        const base = generateSchedule(t, [], until);
        fc.pre(base.length >= 2);
        const index = 1 + (pick % (base.length - 1));
        const effectivePeriodStart = base[index]?.start;
        if (effectivePeriodStart === undefined) throw new Error('index out of range');
        const amendment: Amendment = {
          effectivePeriodStart,
          changes: { ...(newRent === null ? {} : { rentVnd: newRent }), ...(newCycle === null ? {} : { billingCycleMonths: newCycle }) },
        };
        const amended = generateSchedule(t, [amendment], until);
        expect(amended.slice(0, index)).toEqual(base.slice(0, index));
        expect(amended[index]?.start).toBe(effectivePeriodStart);
        expectTiling(amended, t, until);
        const first = amended[index];
        if (first === undefined) throw new Error('amended period missing');
        if (newRent !== null) expect(first.monthlyRentVnd).toBe(newRent);
        if (newCycle !== null) expect(first.end).toBe(addDays(addMonths(effectivePeriodStart, newCycle), -1));
      }),
      params,
    );
  });
});
