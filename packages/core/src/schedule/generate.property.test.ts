import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { addDays, addMonths, firstOfMonth, monthsUntil } from './dates';
import { applyEscalation } from './escalation';
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

const plain: fc.Arbitrary<LeaseTerms> = terms.map((t) => ({ ...t, escalation: { kind: 'none' }, endDate: null }));

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
          expect(p.rentVnd).toBeLessThanOrEqual(p.prorated.fullRentVnd);
          expect(p.rentVnd).toBe(prorateOracle(p.prorated.fullRentVnd, p.prorated.days, p.prorated.daysInFullPeriod));
        }
      }),
      params,
    );
  });

  it('totals rent times the number of periods, adjusted only for proration, when nothing escalates', () => {
    fc.assert(
      fc.property(fc.tuple(plain, fc.integer({ min: 0, max: 2_000 })), ([t, days]) => {
        const until = addDays(t.startDate, days);
        const periods = generateSchedule(t, [], until);
        const gridOrigin = t.periodAnchor === 'lease_start' ? t.startDate : firstOfMonth(t.startDate);
        expect(periods).toHaveLength(Math.floor(monthsUntil(gridOrigin, until) / t.billingCycleMonths) + 1);
        const expectedTotal = periods.reduce(
          (sum, p) => sum + (p.prorated === null ? t.rentVnd : prorateOracle(t.rentVnd, p.prorated.days, p.prorated.daysInFullPeriod)),
          0,
        );
        expect(periods.reduce((sum, p) => sum + p.rentVnd, 0)).toBe(expectedTotal);
        expect(periods.filter((p) => p.prorated !== null).length).toBeLessThanOrEqual(1);
      }),
      params,
    );
  });

  it('starts every period on the anchor grid', () => {
    fc.assert(
      fc.property(termsAndUntil, ({ terms: t, until }) => {
        for (const [i, p] of generateSchedule(t, [], until).entries()) {
          if (t.periodAnchor === 'lease_start') expect(p.start).toBe(addMonths(t.startDate, i * t.billingCycleMonths));
          else if (i > 0) expect(p.start).toBe(addMonths(firstOfMonth(t.startDate), i * t.billingCycleMonths));
        }
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

  it('escalates to applyEscalation at every period start, in multiples of rounding_vnd, and never down once a step outweighs the rounding', () => {
    fc.assert(
      fc.property(termsAndUntil, ({ terms: t, until }) => {
        const e = t.escalation;
        const firstIncrease = e.kind === 'percent' ? (t.rentVnd * e.valueBps) / 10_000 : e.kind === 'fixed' ? e.valueVnd : 0;
        const monotone = e.kind === 'none' || firstIncrease >= e.roundingVnd / 2;
        let previous = 0;
        for (const p of generateSchedule(t, [], until)) {
          const full = p.prorated === null ? p.rentVnd : p.prorated.fullRentVnd;
          expect(full).toBe(applyEscalation(t.rentVnd, e, p.start, t.startDate));
          if (monotone) expect(full).toBeGreaterThanOrEqual(previous);
          if (e.kind !== 'none' && full !== t.rentVnd) expect(full % e.roundingVnd).toBe(0);
          previous = full;
        }
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
        if (newRent !== null) expect(first.prorated === null ? first.rentVnd : first.prorated.fullRentVnd).toBe(newRent);
        if (newCycle !== null) expect(first.end).toBe(addDays(addMonths(effectivePeriodStart, newCycle), -1));
      }),
      params,
    );
  });
});
