import { describe, expect, it } from 'vitest';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { grossYieldBp, latestValuation, portfolioValue } from './portfolio';

const asOf = isoDate('2026-10-07');
const valuation = (propertyId: string, day: string, value: number) => ({ propertyId, asOf: isoDate(day) as IsoDate, valueVnd: vnd(value) });

describe('latestValuation', () => {
  it('takes the latest of two valuations', () => {
    const older = valuation('q1', '2026-01-10', 9_000_000_000);
    const newer = valuation('q1', '2026-07-01', 9_500_000_000);
    expect(latestValuation([older, newer], asOf)).toBe(newer);
    expect(latestValuation([newer, older], asOf)).toBe(newer);
  });

  it('skips a valuation dated after asOf, and has none when none is on or before it', () => {
    const later = valuation('q1', '2026-10-08', 9_500_000_000);
    expect(latestValuation([later], asOf)).toBeUndefined();
    expect(latestValuation([], asOf)).toBeUndefined();
    expect(latestValuation([valuation('q1', '2026-10-07', 1), later], asOf)?.valueVnd).toBe(1);
  });

  it('gives a tie on the same day to the one listed first', () => {
    const first = valuation('q1', '2026-07-01', 1);
    const second = valuation('q1', '2026-07-01', 2);
    expect(latestValuation([first, second], asOf)).toBe(first);
  });
});

describe('grossYieldBp', () => {
  it('is annual rent over value in basis points', () => {
    expect(grossYieldBp(vnd(617_500_000), vnd(9_500_000_000))).toBe(650);
  });

  it('rounds to whole basis points, half up', () => {
    // 1 / 30.000 is 0,333… bp → 0; 1 / 20.000 is exactly 0,5 bp → 1; 2 / 30.000 is 0,666… bp → 1.
    expect(grossYieldBp(vnd(1), vnd(30_000))).toBe(0);
    expect(grossYieldBp(vnd(1), vnd(20_000))).toBe(1);
    expect(grossYieldBp(vnd(2), vnd(30_000))).toBe(1);
    // 360.000.000 on 7 tỷ is 514,2857… bp → 514; 360.000.000 on 7,2 tỷ is exactly 500.
    expect(grossYieldBp(vnd(360_000_000), vnd(7_000_000_000))).toBe(514);
    expect(grossYieldBp(vnd(360_000_000), vnd(7_200_000_000))).toBe(500);
  });

  it('stays exact at the amount ceiling', () => {
    expect(grossYieldBp(vnd(1_000_000_000_000), vnd(1_000_000_000_000))).toBe(10_000);
  });
});

describe('portfolioValue', () => {
  it('sums each property latest valuation, with the oldest date summed and the count without one', () => {
    const valuations = [
      valuation('q1', '2026-01-10', 9_000_000_000),
      valuation('q1', '2026-07-01', 9_500_000_000),
      valuation('bao-loc', '2026-03-15', 3_200_000_000),
      valuation('q7', '2026-11-01', 12_000_000_000),
    ];
    expect(portfolioValue(['q1', 'bao-loc', 'q7', 'long-an'], valuations, asOf)).toEqual({
      totalVnd: 12_700_000_000,
      oldestAsOf: '2026-03-15',
      valuedCount: 2,
      unvaluedCount: 2,
    });
  });

  it('leaves out a valuation of a property not listed, such as one archived', () => {
    expect(portfolioValue(['q1'], [valuation('q1', '2026-07-01', 1), valuation('gone', '2026-07-01', 5)], asOf)?.totalVnd).toBe(1);
  });

  it('is null when no property has a valuation on or before asOf', () => {
    expect(portfolioValue(['q1'], [valuation('q1', '2026-10-08', 1)], asOf)).toBeNull();
    expect(portfolioValue([], [], asOf)).toBeNull();
  });
});
