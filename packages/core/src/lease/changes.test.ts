import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { LeaseTerms } from '../schedule';
import { amendmentStarts, lastMonthlyRent, renewalRent, renewalStart } from './changes';

const thuDuc: LeaseTerms = {
  startDate: d('2025-11-01'),
  endDate: d('2026-11-01'),
  rentVnd: vnd(9_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'by_days',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: d('2025-09-30'),
};

const phong2: LeaseTerms = {
  ...thuDuc,
  startDate: d('2025-06-25'),
  endDate: d('2027-06-24'),
  rentVnd: vnd(2_500_000),
  periodAnchor: 'lease_start',
  paidThroughDate: d('2025-09-24'),
};

describe('renewalRent (SPEC §9.4 seed 7)', () => {
  it('raises the Thủ Đức rent of 9.000.000 ₫ by 5%: 9.450.000 ₫ rounds half up to 9.500.000 ₫', () => {
    expect(renewalRent(lastMonthlyRent(thuDuc, []), 500)).toBe(9_500_000);
  });

  it('rounds half up to 100.000 ₫', () => {
    expect(renewalRent(lastMonthlyRent({ ...thuDuc, rentVnd: vnd(2_500_000) }, []), 300)).toBe(2_600_000);
    expect(renewalRent(lastMonthlyRent({ ...thuDuc, rentVnd: vnd(2_499_999) }, []), 200)).toBe(2_500_000);
    expect(renewalRent(lastMonthlyRent({ ...thuDuc, rentVnd: vnd(2_450_000) }, []), 0)).toBe(2_500_000);
    expect(renewalRent(lastMonthlyRent({ ...thuDuc, rentVnd: vnd(2_449_999) }, []), 0)).toBe(2_400_000);
  });

  it('starts from the last monthly rent, after amendments and escalation', () => {
    expect(renewalRent(lastMonthlyRent(thuDuc, [{ effectivePeriodStart: d('2026-06-01'), changes: { rentVnd: vnd(10_000_000) } }]), 500)).toBe(10_500_000);
    const escalating: LeaseTerms = { ...thuDuc, startDate: d('2024-11-01'), escalation: { kind: 'percent', valueBps: 1_000, everyMonths: 12, roundingVnd: vnd(100_000) } };
    expect(renewalRent(lastMonthlyRent(escalating, []), 0)).toBe(10_900_000);
  });

  it('starts the day after the old lease ends', () => {
    expect(renewalStart(thuDuc)).toBe('2026-11-02');
    expect(renewalStart({ ...thuDuc, endDate: null })).toBeNull();
  });
});

describe('amendmentStarts (LSE-2)', () => {
  it('offers Phòng 2 only the period starts after 07/10/2026 that no issued invoice reaches', () => {
    expect(amendmentStarts(phong2, [], d('2026-10-07'), d('2026-11-24'), d('2027-02-28'))).toEqual(['2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25']);
  });

  it('skips a start an amendment already uses and stops at the end date', () => {
    const used = [{ effectivePeriodStart: d('2026-12-25'), changes: { rentVnd: vnd(2_700_000) } }];
    expect(amendmentStarts(phong2, used, d('2026-10-07'), d('2026-11-24'), d('2027-12-31')).slice(0, 2)).toEqual(['2026-11-25', '2027-01-25']);
    expect(amendmentStarts(phong2, used, d('2026-10-07'), d('2026-11-24'), d('2027-12-31')).at(-1)).toBe('2027-05-25');
  });

  it('offers nothing before a paid-through date in the future', () => {
    const q7: LeaseTerms = { ...thuDuc, startDate: d('2025-01-01'), endDate: d('2027-12-31'), billingCycleMonths: 3, paidThroughDate: d('2026-12-31') };
    expect(amendmentStarts(q7, [], d('2026-10-07'), null, d('2027-12-31'))).toEqual(['2027-01-01', '2027-04-01', '2027-07-01', '2027-10-01']);
  });
});
