import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { LeaseTerms } from '../schedule';
import { currentMonthlyRent } from './monthlyRent';

const base: LeaseTerms = {
  startDate: d('2025-01-01'),
  endDate: null,
  rentVnd: vnd(15_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'by_days',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: null,
};

describe('currentMonthlyRent', () => {
  it('reads a quarterly lease as its monthly rent, not the quarter total', () => {
    expect(currentMonthlyRent({ ...base, billingCycleMonths: 3 }, [], d('2026-10-07'))).toBe(15_000_000);
  });

  it('reads an annual prepaid lease as its monthly rent', () => {
    expect(currentMonthlyRent({ ...base, startDate: d('2026-03-01'), rentVnd: vnd(30_000_000), billingCycleMonths: 12 }, [], d('2026-10-07'))).toBe(30_000_000);
  });

  it('takes the escalated rent once the escalation period has passed, rounded to 100.000 ₫', () => {
    const escalated: LeaseTerms = { ...base, escalation: { kind: 'percent', valueBps: 500, everyMonths: 12, roundingVnd: vnd(100_000) } };
    expect(currentMonthlyRent(escalated, [], d('2025-12-31'))).toBe(15_000_000);
    expect(currentMonthlyRent(escalated, [], d('2026-01-01'))).toBe(15_800_000);
    expect(currentMonthlyRent({ ...escalated, billingCycleMonths: 3 }, [], d('2026-10-07'))).toBe(15_800_000);
  });

  it('applies an amendment from its period start', () => {
    const amendments = [{ effectivePeriodStart: d('2026-11-01'), changes: { rentVnd: vnd(16_000_000) } }];
    expect(currentMonthlyRent(base, amendments, d('2026-10-31'))).toBe(15_000_000);
    expect(currentMonthlyRent(base, amendments, d('2026-11-01'))).toBe(16_000_000);
  });

  it('reads the agreed rent before the lease starts', () => {
    expect(currentMonthlyRent({ ...base, startDate: d('2026-12-01') }, [], d('2026-10-07'))).toBe(15_000_000);
  });
});
