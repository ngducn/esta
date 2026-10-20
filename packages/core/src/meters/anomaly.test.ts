import { describe, expect, it } from 'vitest';
import { isAnomalous, median, usualConsumption } from './anomaly';

describe('the 3× six-month median warning (LSE-4)', () => {
  const sixMonths = [110, 95, 130, 120, 100, 125];

  it('stays quiet for a normal month', () => {
    expect(usualConsumption(sixMonths)).toBe(115);
    expect(isAnomalous(sixMonths, 140)).toBe(false);
  });

  it('stays quiet at exactly three times the median', () => {
    expect(isAnomalous(sixMonths, 345)).toBe(false);
  });

  it('warns above three times the median', () => {
    expect(isAnomalous(sixMonths, 346)).toBe(true);
    expect(isAnomalous(sixMonths, 1200)).toBe(true);
  });

  it('looks back only six months', () => {
    expect(usualConsumption([1000, 1000, 1000, ...sixMonths])).toBe(115);
  });

  it('uses every month there is when fewer than six', () => {
    expect(usualConsumption([120])).toBe(120);
    expect(isAnomalous([120], 361)).toBe(true);
    expect(isAnomalous([100, 140], 360)).toBe(false);
    expect(isAnomalous([100, 140], 361)).toBe(true);
  });

  it('has nothing to compare with before a month of history, or when the meter used nothing', () => {
    expect(isAnomalous([], 5000)).toBe(false);
    expect(isAnomalous([0, 0, 0], 50)).toBe(false);
  });

  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
