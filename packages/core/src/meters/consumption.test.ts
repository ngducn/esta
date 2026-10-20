import { describe, expect, it } from 'vitest';
import { consumption, monthlyConsumption } from './consumption';

describe('consumption (LSE-4)', () => {
  it('is the reading less the one before it', () => {
    expect(consumption(2847, 2967)).toEqual({ ok: true, value: 120 });
  });

  it('is zero when the meter did not move', () => {
    expect(consumption(312, 312)).toEqual({ ok: true, value: 0 });
  });

  it('refuses a reading below the one before it', () => {
    expect(consumption(4120, 4119)).toEqual({ ok: false, reason: 'below_previous' });
  });
});

describe('monthlyConsumption', () => {
  it('gives each month after the first its use, in month order, and carries a skipped month into the next', () => {
    const readings = [
      { month: '2026-10-01', reading: 2967 },
      { month: '2026-07-01', reading: 2500 },
      { month: '2026-09-01', reading: 2847 },
      { month: '2026-08-01', reading: 2610 },
      { month: '2026-12-01', reading: 3300 },
    ];
    expect(monthlyConsumption(readings)).toEqual([
      { month: '2026-08-01', used: 110 },
      { month: '2026-09-01', used: 237 },
      { month: '2026-10-01', used: 120 },
      { month: '2026-12-01', used: 333 },
    ]);
  });

  it('has no use for a meter with one reading', () => {
    expect(monthlyConsumption([{ month: '2026-09-01', reading: 2847 }])).toEqual([]);
  });
});
