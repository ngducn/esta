import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { currentMonthlyRent } from './monthlyRent';

describe('currentMonthlyRent', () => {
  it('reads a quarterly lease as its monthly rent, not the quarter total', () => {
    expect(currentMonthlyRent(schedulePeriods('q7', '2025-01-01', 15_000_000, 8, 3), d('2026-10-07'))).toBe(15_000_000);
  });

  it('takes the rent of the period that contains the day, so an increase or an amendment counts from its period start', () => {
    const periods = [...schedulePeriods('l', '2025-01-01', 15_000_000, 12), ...schedulePeriods('l', '2026-01-01', 15_800_000, 10)];
    expect(currentMonthlyRent(periods, d('2025-12-31'))).toBe(15_000_000);
    expect(currentMonthlyRent(periods, d('2026-01-01'))).toBe(15_800_000);
    expect(currentMonthlyRent(periods.map((period) => (period.start >= '2026-10-01' ? { ...period, monthlyRentVnd: vnd(16_000_000) } : period)), d('2026-10-07'))).toBe(16_000_000);
  });

  it('is null before the first period, when the agreed rent applies', () => {
    expect(currentMonthlyRent(schedulePeriods('l', '2026-12-01', 15_000_000, 3).filter((period) => period.start <= '2026-10-07'), d('2026-10-07'))).toBeNull();
    expect(currentMonthlyRent([], d('2026-10-07'))).toBeNull();
  });
});
