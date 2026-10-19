import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { amendmentStarts, renewalRent, renewalStart } from './changes';

describe('renewalRent (SPEC §9.4 seed 7)', () => {
  it('raises the Thủ Đức rent of 9.000.000 ₫ by 5%: 9.450.000 ₫ rounds half up to 9.500.000 ₫', () => {
    expect(renewalRent(vnd(9_000_000), 500)).toBe(9_500_000);
  });

  it('rounds half up to 100.000 ₫', () => {
    expect(renewalRent(vnd(2_500_000), 300)).toBe(2_600_000);
    expect(renewalRent(vnd(2_499_999), 200)).toBe(2_500_000);
    expect(renewalRent(vnd(2_450_000), 0)).toBe(2_500_000);
    expect(renewalRent(vnd(2_449_999), 0)).toBe(2_400_000);
  });

  it('starts the day after the old lease ends', () => {
    expect(renewalStart(d('2026-11-01'))).toBe('2026-11-02');
    expect(renewalStart(null)).toBeNull();
  });
});

describe('amendmentStarts (LSE-2)', () => {
  const phong2 = schedulePeriods('phong-2', '2025-06-25', 2_500_000, 24);
  const floors = { asOf: d('2026-10-07'), billedThrough: d('2026-11-24'), paidThrough: d('2025-09-24') };

  it('offers Phòng 2 only the period starts after 07/10/2026 that no issued invoice reaches', () => {
    expect(amendmentStarts(phong2.slice(0, 21), [], floors)).toEqual(['2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25']);
  });

  it('skips a start an amendment already uses and stops at the last period', () => {
    const used = [{ effectivePeriodStart: d('2026-12-25'), changes: { rentVnd: vnd(2_700_000) } }];
    expect(amendmentStarts(phong2, used, floors).slice(0, 2)).toEqual(['2026-11-25', '2027-01-25']);
    expect(amendmentStarts(phong2, used, floors).at(-1)).toBe('2027-05-25');
  });

  it('offers nothing before a paid-through date in the future', () => {
    const q7 = schedulePeriods('q7', '2025-01-01', 15_000_000, 12, 3);
    expect(amendmentStarts(q7, [], { asOf: d('2026-10-07'), billedThrough: null, paidThrough: d('2026-12-31') })).toEqual(['2027-01-01', '2027-04-01', '2027-07-01', '2027-10-01']);
  });
});
