import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { generateSchedule } from './generate';
import type { Amendment, LeaseTerms } from './types';

const BUDGET_MS = 1;

const tenYearsMonthly: LeaseTerms = {
  startDate: isoDate('2026-01-15'),
  endDate: null,
  rentVnd: vnd(12_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'by_days',
  dueOffsetDays: 5,
  escalation: { kind: 'percent', valueBps: 500, everyMonths: 12, roundingVnd: vnd(100_000) },
  paidThroughDate: isoDate('2026-06-30'),
};

const amendments: Amendment[] = [
  { effectivePeriodStart: isoDate('2028-01-01'), changes: { rentVnd: vnd(14_000_000) } },
  { effectivePeriodStart: isoDate('2030-01-01'), changes: { billingCycleMonths: 3 } },
  { effectivePeriodStart: isoDate('2033-01-01'), changes: { rentVnd: vnd(20_000_000), billingCycleMonths: 1 } },
];

test('generateSchedule stays under 1 ms for a 10-year monthly lease with three amendments and escalation', async ({ bench }) => {
  const result = await bench('generateSchedule 10y', () => {
    generateSchedule(tenYearsMonthly, amendments, isoDate('2036-01-15'));
  }).run();
  expect(result.latency.mean).toBeLessThan(BUDGET_MS);
});
