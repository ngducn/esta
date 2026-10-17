import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { applyEscalation } from './escalation';
import { generateSchedule, validateAmendment } from './generate';
import type { Amendment, Escalation, LeaseTerms, Period } from './types';

const d = isoDate;

const monthlyFrom25th: LeaseTerms = {
  startDate: d('2026-01-25'),
  endDate: null,
  rentVnd: vnd(3_500_000),
  billingCycleMonths: 1,
  periodAnchor: 'lease_start',
  firstPeriodProration: 'none',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: null,
};

function lease(overrides: Partial<LeaseTerms>): LeaseTerms {
  return { ...monthlyFrom25th, ...overrides };
}

const fivePercentYearly: Escalation = { kind: 'percent', valueBps: 500, everyMonths: 12, roundingVnd: vnd(100_000) };

const lse3Canonical = lease({
  startDate: d('2026-07-15'),
  rentVnd: vnd(10_000_000),
  periodAnchor: 'calendar_month',
  paidThroughDate: d('2026-09-30'),
});

function spans(periods: readonly Period[]): string[] {
  return periods.map((p) => `${p.start}..${p.end}`);
}

function rents(periods: readonly Period[]): number[] {
  return periods.map((p) => p.rentVnd);
}

function monthlyRents(periods: readonly Period[]): number[] {
  return periods.map((p) => p.monthlyRentVnd);
}

function distinct(values: readonly number[]): number[] {
  return [...new Set(values)];
}

describe('period grid per cycle and anchor', () => {
  it('bills a monthly lease anchored on the 25th across February (Dĩ An Phòng 3)', () => {
    const periods = generateSchedule(monthlyFrom25th, [], d('2026-11-30'));
    expect(spans(periods).slice(0, 3)).toEqual(['2026-01-25..2026-02-24', '2026-02-25..2026-03-24', '2026-03-25..2026-04-24']);
    expect(spans(periods)).toContain('2026-09-25..2026-10-24');
    expect(spans(periods)).toContain('2026-10-25..2026-11-24');
    expect(periods.every((p) => p.dueDate === p.start && p.rentVnd === 3_500_000 && p.prorated === null)).toBe(true);
  });

  it('clamps a 31 January anchor to the end of each shorter month without drifting', () => {
    const periods = generateSchedule(lease({ startDate: d('2026-01-31') }), [], d('2026-06-01'));
    expect(spans(periods)).toEqual([
      '2026-01-31..2026-02-27',
      '2026-02-28..2026-03-30',
      '2026-03-31..2026-04-29',
      '2026-04-30..2026-05-30',
      '2026-05-31..2026-06-29',
    ]);
  });

  it('runs 31 January to 29 February in a leap year', () => {
    const periods = generateSchedule(lease({ startDate: d('2024-01-31') }), [], d('2024-04-01'));
    expect(spans(periods)).toEqual(['2024-01-31..2024-02-28', '2024-02-29..2024-03-30', '2024-03-31..2024-04-29']);
  });

  it('keeps a 29 February annual anchor on 28 February until the next leap year', () => {
    const periods = generateSchedule(lease({ startDate: d('2024-02-29'), billingCycleMonths: 12 }), [], d('2028-03-01'));
    expect(spans(periods)).toEqual([
      '2024-02-29..2025-02-27',
      '2025-02-28..2026-02-27',
      '2026-02-28..2027-02-27',
      '2027-02-28..2028-02-28',
      '2028-02-29..2029-02-27',
    ]);
  });

  it('bills a quarterly calendar lease on 1 January, April, July and October (q7)', () => {
    const q7 = lease({
      startDate: d('2025-01-01'),
      rentVnd: vnd(20_000_000),
      billingCycleMonths: 3,
      periodAnchor: 'calendar_month',
      paidThroughDate: d('2026-12-31'),
    });
    const periods = generateSchedule(q7, [], d('2027-01-01'));
    expect(periods.map((p) => p.start.slice(5))).toEqual(['01-01', '04-01', '07-01', '10-01', '01-01', '04-01', '07-01', '10-01', '01-01']);
    expect(spans(periods)[0]).toBe('2025-01-01..2025-03-31');
    expect(spans(periods)[8]).toBe('2027-01-01..2027-03-31');
    expect(periods.map((p) => p.coveredByPaidThrough)).toEqual([true, true, true, true, true, true, true, true, false]);
    expect(periods.every((p) => p.monthlyRentVnd === 20_000_000 && p.rentVnd === 60_000_000 && p.prorated === null)).toBe(true);
  });

  it('bills a six-month lease from its start date', () => {
    const periods = generateSchedule(lease({ startDate: d('2026-03-10'), billingCycleMonths: 6 }), [], d('2027-03-10'));
    expect(spans(periods)).toEqual(['2026-03-10..2026-09-09', '2026-09-10..2027-03-09', '2027-03-10..2027-09-09']);
  });

  it('bills monthly rent times the cycle and prorates a cut quarter over the days of the full quarter', () => {
    const periods = generateSchedule(lease({ startDate: d('2026-01-10'), endDate: d('2026-05-09'), rentVnd: vnd(10_000_000), billingCycleMonths: 3 }), [], d('2027-01-01'));
    expect(spans(periods)).toEqual(['2026-01-10..2026-04-09', '2026-04-10..2026-05-09']);
    expect(periods[0]).toMatchObject({ monthlyRentVnd: 10_000_000, rentVnd: 30_000_000, prorated: null });
    expect(periods[1]).toMatchObject({ monthlyRentVnd: 10_000_000, rentVnd: 9_890_110, prorated: { days: 30, daysInFullPeriod: 91, fullPeriodVnd: 30_000_000 } });
  });

  it('bills an annual prepaid lease as one covered period (q1)', () => {
    const q1 = lease({
      startDate: d('2026-03-01'),
      endDate: d('2027-02-28'),
      rentVnd: vnd(20_000_000),
      billingCycleMonths: 12,
      paidThroughDate: d('2027-02-28'),
    });
    const periods = generateSchedule(q1, [], d('2027-12-31'));
    expect(spans(periods)).toEqual(['2026-03-01..2027-02-28']);
    expect(periods[0]).toMatchObject({ monthlyRentVnd: 20_000_000, rentVnd: 240_000_000, prorated: null, coveredByPaidThrough: true, dueDate: '2026-03-01' });
  });

  it('aligns a quarterly calendar lease to months counted from its start month', () => {
    const periods = generateSchedule(
      lease({ startDate: d('2026-08-10'), rentVnd: vnd(10_000_000), billingCycleMonths: 3, periodAnchor: 'calendar_month', firstPeriodProration: 'by_days' }),
      [],
      d('2026-11-01'),
    );
    expect(spans(periods)).toEqual(['2026-08-10..2026-10-31', '2026-11-01..2027-01-31']);
    expect(periods[0]?.prorated).toEqual({ days: 83, daysInFullPeriod: 92, fullPeriodVnd: 30_000_000 });
    expect(rents(periods)).toEqual([27_065_217, 30_000_000]);
  });
});

describe('first period proration', () => {
  it('prorates a mid-month calendar start by days when the lease says so', () => {
    const periods = generateSchedule(lease({ ...lse3Canonical, paidThroughDate: null, firstPeriodProration: 'by_days' }), [], d('2026-08-01'));
    expect(spans(periods)).toEqual(['2026-07-15..2026-07-31', '2026-08-01..2026-08-31']);
    expect(periods[0]).toMatchObject({ rentVnd: 5_483_871, prorated: { days: 17, daysInFullPeriod: 31, fullPeriodVnd: 10_000_000 } });
    expect(periods[1]).toMatchObject({ rentVnd: 10_000_000, prorated: null });
  });

  it('charges the full rent for a short first period under none', () => {
    const periods = generateSchedule(lease({ ...lse3Canonical, paidThroughDate: null }), [], d('2026-08-01'));
    expect(periods[0]).toMatchObject({ start: '2026-07-15', end: '2026-07-31', rentVnd: 10_000_000, prorated: null });
  });

  it('never prorates the first period of a lease_start anchor', () => {
    const periods = generateSchedule(lease({ startDate: d('2026-07-15'), firstPeriodProration: 'by_days' }), [], d('2026-07-15'));
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ start: '2026-07-15', end: '2026-08-14', rentVnd: 3_500_000, prorated: null });
  });
});

describe('paid_through_date', () => {
  it('marks every period ending on or before paid_through_date as covered (LSE-3 canonical)', () => {
    const periods = generateSchedule(lse3Canonical, [], d('2026-11-11'));
    expect(spans(periods)).toEqual([
      '2026-07-15..2026-07-31',
      '2026-08-01..2026-08-31',
      '2026-09-01..2026-09-30',
      '2026-10-01..2026-10-31',
      '2026-11-01..2026-11-30',
    ]);
    expect(periods.map((p) => p.coveredByPaidThrough)).toEqual([true, true, true, false, false]);
    const firstOpen = periods.find((p) => !p.coveredByPaidThrough);
    expect(firstOpen).toMatchObject({ start: '2026-10-01', end: '2026-10-31', dueDate: '2026-10-01', rentVnd: 10_000_000 });
  });

  it('does not cover a period that ends after paid_through_date', () => {
    const covered = generateSchedule(lease({ paidThroughDate: d('2026-02-24') }), [], d('2026-01-25'));
    const notCovered = generateSchedule(lease({ paidThroughDate: d('2026-02-23') }), [], d('2026-01-25'));
    expect(covered[0]?.coveredByPaidThrough).toBe(true);
    expect(notCovered[0]?.coveredByPaidThrough).toBe(false);
  });
});

describe('end dates', () => {
  it('prorates the last period of a calendar lease that ends mid-month', () => {
    const periods = generateSchedule(
      lease({ startDate: d('2026-01-01'), endDate: d('2026-11-07'), rentVnd: vnd(12_000_000), periodAnchor: 'calendar_month' }),
      [],
      d('2027-01-01'),
    );
    expect(periods).toHaveLength(11);
    expect(periods.at(-1)).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-07',
      rentVnd: 2_800_000,
      prorated: { days: 7, daysInFullPeriod: 30, fullPeriodVnd: 12_000_000 },
    });
  });

  it('bills a single-day last period (thu-duc ends 2026-11-01)', () => {
    const thuDuc = lease({
      startDate: d('2025-11-01'),
      endDate: d('2026-11-01'),
      rentVnd: vnd(8_000_000),
      periodAnchor: 'calendar_month',
      paidThroughDate: d('2026-10-31'),
    });
    const periods = generateSchedule(thuDuc, [], d('2027-01-01'));
    expect(periods.at(-2)).toMatchObject({ start: '2026-10-01', end: '2026-10-31', coveredByPaidThrough: true });
    expect(periods.at(-1)).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-01',
      rentVnd: 266_667,
      prorated: { days: 1, daysInFullPeriod: 30, fullPeriodVnd: 8_000_000 },
      coveredByPaidThrough: false,
    });
  });

  it('prorates a lease_start anchor that ends mid-cycle over the full cycle length', () => {
    const periods = generateSchedule(lease({ endDate: d('2026-04-10') }), [], d('2027-01-01'));
    expect(spans(periods)).toEqual(['2026-01-25..2026-02-24', '2026-02-25..2026-03-24', '2026-03-25..2026-04-10']);
    expect(periods.at(-1)).toMatchObject({ rentVnd: 1_919_355, prorated: { days: 17, daysInFullPeriod: 31, fullPeriodVnd: 3_500_000 } });
  });

  it('does not prorate a last period that ends exactly on a cycle boundary', () => {
    const periods = generateSchedule(lease({ endDate: d('2026-02-24') }), [], d('2027-01-01'));
    expect(spans(periods)).toEqual(['2026-01-25..2026-02-24']);
    expect(periods[0]?.prorated).toBeNull();
  });

  it('bills only the days inside the lease when the end date cuts a first calendar period, under none as under by_days', () => {
    const cut = { startDate: d('2026-07-15'), endDate: d('2026-07-20'), rentVnd: vnd(10_000_000), periodAnchor: 'calendar_month' as const };
    const none = generateSchedule(lease({ ...cut, firstPeriodProration: 'none' }), [], d('2027-01-01'));
    const byDays = generateSchedule(lease({ ...cut, firstPeriodProration: 'by_days' }), [], d('2027-01-01'));
    expect(none[0]).toMatchObject({ end: '2026-07-20', rentVnd: 1_935_484, prorated: { days: 6, daysInFullPeriod: 31 } });
    expect(byDays[0]).toMatchObject({ end: '2026-07-20', rentVnd: 1_935_484, prorated: { days: 6, daysInFullPeriod: 31 } });
    const oneDay = generateSchedule(lease({ ...cut, endDate: d('2026-07-15'), firstPeriodProration: 'none' }), [], d('2027-01-01'));
    expect(oneDay).toEqual([expect.objectContaining({ start: '2026-07-15', end: '2026-07-15', rentVnd: 322_581, prorated: { days: 1, daysInFullPeriod: 31, fullPeriodVnd: 10_000_000 } })]);
  });

  it('returns nothing for an end date before the start date', () => {
    expect(generateSchedule(lease({ endDate: d('2026-01-24') }), [], d('2027-01-01'))).toEqual([]);
  });
});

describe('until and open-ended leases', () => {
  it('generates every period starting on or before until and lets the last run to its natural end', () => {
    const periods = generateSchedule(monthlyFrom25th, [], d('2026-12-31'));
    expect(periods).toHaveLength(12);
    expect(periods.at(-1)).toMatchObject({ start: '2026-12-25', end: '2027-01-24' });
  });

  it('includes the period that starts on until and nothing before the lease start', () => {
    expect(spans(generateSchedule(monthlyFrom25th, [], d('2026-01-25')))).toEqual(['2026-01-25..2026-02-24']);
    expect(generateSchedule(monthlyFrom25th, [], d('2026-01-24'))).toEqual([]);
  });
});

describe('due dates', () => {
  it('offsets the due date from the period start by due_offset_days', () => {
    expect(generateSchedule(lease({ dueOffsetDays: 5 }), [], d('2026-02-25')).map((p) => p.dueDate)).toEqual(['2026-01-30', '2026-03-02']);
    expect(generateSchedule(lease({ dueOffsetDays: -3 }), [], d('2026-01-25')).map((p) => p.dueDate)).toEqual(['2026-01-22']);
  });
});

describe('escalation', () => {
  const quarterly100M = lease({ startDate: d('2025-01-01'), rentVnd: vnd(100_000_000), billingCycleMonths: 3, escalation: fivePercentYearly });

  it('compounds 5% every 12 months on the monthly rent, rounds half up to 100,000 and bills three months a quarter', () => {
    const periods = generateSchedule(quarterly100M, [], d('2027-12-31'));
    expect(monthlyRents(periods)).toEqual([
      ...Array<number>(4).fill(100_000_000),
      ...Array<number>(4).fill(105_000_000),
      ...Array<number>(4).fill(110_300_000),
    ]);
    expect(rents(periods)).toEqual([
      ...Array<number>(4).fill(300_000_000),
      ...Array<number>(4).fill(315_000_000),
      ...Array<number>(4).fill(330_900_000),
    ]);
  });

  it('adds a fixed amount every 12 months', () => {
    const fixed: Escalation = { kind: 'fixed', valueVnd: vnd(5_000_000), everyMonths: 12, roundingVnd: vnd(100_000) };
    const periods = generateSchedule(lease({ ...quarterly100M, escalation: fixed }), [], d('2027-12-31'));
    expect(rents(periods)).toEqual([
      ...Array<number>(4).fill(300_000_000),
      ...Array<number>(4).fill(315_000_000),
      ...Array<number>(4).fill(330_000_000),
    ]);
  });

  it('rounds each step half up to rounding_vnd before compounding the next', () => {
    const to100k = generateSchedule(lease({ ...quarterly100M, rentVnd: vnd(73_000_000) }), [], d('2027-01-01'));
    expect(distinct(monthlyRents(to100k))).toEqual([73_000_000, 76_700_000, 80_500_000]);
    expect(distinct(rents(to100k))).toEqual([219_000_000, 230_100_000, 241_500_000]);
    const toDong = generateSchedule(lease({ ...quarterly100M, rentVnd: vnd(73_000_000), escalation: { ...fivePercentYearly, roundingVnd: vnd(1) } }), [], d('2027-01-01'));
    expect(distinct(monthlyRents(toDong))).toEqual([73_000_000, 76_650_000, 80_482_500]);
  });

  it('steps on the first period that starts on or after the lease anniversary', () => {
    const periods = generateSchedule(lease({ ...lse3Canonical, paidThroughDate: null, escalation: fivePercentYearly }), [], d('2027-08-01'));
    const july2027 = periods.find((p) => p.start === '2027-07-01');
    const august2027 = periods.find((p) => p.start === '2027-08-01');
    expect(july2027?.rentVnd).toBe(10_000_000);
    expect(august2027?.rentVnd).toBe(10_500_000);
  });

  it('prorates the escalated rent, not the original', () => {
    const periods = generateSchedule(
      lease({ startDate: d('2026-01-01'), endDate: d('2027-01-07'), rentVnd: vnd(12_000_000), periodAnchor: 'calendar_month', escalation: fivePercentYearly }),
      [],
      d('2027-12-31'),
    );
    expect(periods.at(-1)).toMatchObject({ start: '2027-01-01', end: '2027-01-07', rentVnd: 2_845_161, prorated: { days: 7, daysInFullPeriod: 31, fullPeriodVnd: 12_600_000 } });
  });

  it('keeps every đồng when rent times the factor passes 2^53', () => {
    const oneBps: Escalation = { kind: 'percent', valueBps: 1, everyMonths: 12, roundingVnd: vnd(1) };
    expect(applyEscalation(vnd(901_000_004_999), oneBps, d('2027-01-01'), d('2026-01-01'))).toBe(901_090_104_999);
  });

  it('applyEscalation gives the rent in force at a period start', () => {
    expect(applyEscalation(vnd(100_000_000), fivePercentYearly, d('2027-01-01'), d('2025-01-01'))).toBe(110_300_000);
    expect(applyEscalation(vnd(100_000_000), fivePercentYearly, d('2025-12-31'), d('2025-01-01'))).toBe(100_000_000);
    expect(applyEscalation(vnd(100_000_000), { kind: 'none' }, d('2035-01-01'), d('2025-01-01'))).toBe(100_000_000);
  });
});

describe('amendments', () => {
  const rentTo12M: Amendment = { effectivePeriodStart: d('2026-12-01'), changes: { rentVnd: vnd(12_000_000) } };

  it('applies a rent change from its effective period start and leaves earlier periods untouched', () => {
    const without = generateSchedule(lse3Canonical, [], d('2027-01-01'));
    const withAmendment = generateSchedule(lse3Canonical, [rentTo12M], d('2027-01-01'));
    expect(withAmendment.slice(0, 5)).toEqual(without.slice(0, 5));
    expect(withAmendment.slice(5).map((p) => [p.start, p.rentVnd])).toEqual([
      ['2026-12-01', 12_000_000],
      ['2027-01-01', 12_000_000],
    ]);
  });

  it('changes the billing cycle of a calendar lease from the effective period', () => {
    const toQuarterly: Amendment = { effectivePeriodStart: d('2027-01-01'), changes: { billingCycleMonths: 3 } };
    const periods = generateSchedule(lse3Canonical, [toQuarterly], d('2027-04-01'));
    expect(spans(periods).slice(-2)).toEqual(['2027-01-01..2027-03-31', '2027-04-01..2027-06-30']);
  });

  it('changes the billing cycle of a lease_start lease and re-anchors the grid on the effective date', () => {
    const toQuarterly: Amendment = { effectivePeriodStart: d('2026-04-25'), changes: { billingCycleMonths: 3 } };
    const periods = generateSchedule(monthlyFrom25th, [toQuarterly], d('2026-07-25'));
    expect(spans(periods)).toEqual([
      '2026-01-25..2026-02-24',
      '2026-02-25..2026-03-24',
      '2026-03-25..2026-04-24',
      '2026-04-25..2026-07-24',
      '2026-07-25..2026-10-24',
    ]);
  });

  it('keeps the lease anchor day, clamped per month, after a cycle change from a clamped period start', () => {
    const toQuarterly: Amendment = { effectivePeriodStart: d('2026-02-28'), changes: { billingCycleMonths: 3 } };
    const periods = generateSchedule(lease({ startDate: d('2026-01-31') }), [toQuarterly], d('2026-12-01'));
    expect(spans(periods)).toEqual([
      '2026-01-31..2026-02-27',
      '2026-02-28..2026-05-30',
      '2026-05-31..2026-08-30',
      '2026-08-31..2026-11-29',
      '2026-11-30..2027-02-27',
    ]);
  });

  it('keeps a month-end grid when only the rent changes', () => {
    const periods = generateSchedule(
      lease({ startDate: d('2026-01-31') }),
      [{ effectivePeriodStart: d('2026-02-28'), changes: { rentVnd: vnd(4_000_000) } }],
      d('2026-04-01'),
    );
    expect(spans(periods)).toEqual(['2026-01-31..2026-02-27', '2026-02-28..2026-03-30', '2026-03-31..2026-04-29']);
    expect(rents(periods)).toEqual([3_500_000, 4_000_000, 4_000_000]);
  });

  it('escalates an amended rent at the next lease anniversary, not twelve months after the amendment', () => {
    const terms = lease({ startDate: d('2026-01-01'), rentVnd: vnd(10_000_000), escalation: fivePercentYearly });
    const amendment: Amendment = { effectivePeriodStart: d('2027-07-01'), changes: { rentVnd: vnd(12_000_000) } };
    const periods = generateSchedule(terms, [amendment], d('2028-07-01'));
    const rentAt = (start: string) => periods.find((p) => p.start === start)?.rentVnd;
    expect(rentAt('2026-12-01')).toBe(10_000_000);
    expect(rentAt('2027-01-01')).toBe(10_500_000);
    expect(rentAt('2027-06-01')).toBe(10_500_000);
    expect(rentAt('2027-07-01')).toBe(12_000_000);
    expect(rentAt('2027-12-01')).toBe(12_000_000);
    expect(rentAt('2028-01-01')).toBe(12_600_000);
    expect(rentAt('2028-07-01')).toBe(12_600_000);
  });

  it('applies amendments in effective order whatever the input order', () => {
    const later: Amendment = { effectivePeriodStart: d('2027-01-01'), changes: { rentVnd: vnd(13_000_000) } };
    expect(generateSchedule(lse3Canonical, [later, rentTo12M], d('2027-02-01'))).toEqual(generateSchedule(lse3Canonical, [rentTo12M, later], d('2027-02-01')));
  });

  it('throws on an amendment inside the range that matches no period start', () => {
    const offGrid: Amendment = { effectivePeriodStart: d('2026-12-15'), changes: { rentVnd: vnd(12_000_000) } };
    expect(() => generateSchedule(lse3Canonical, [offGrid], d('2027-01-01'))).toThrow(RangeError);
  });

  it('ignores an amendment beyond until', () => {
    const beyond: Amendment = { effectivePeriodStart: d('2027-06-01'), changes: { rentVnd: vnd(12_000_000) } };
    expect(generateSchedule(lse3Canonical, [beyond], d('2027-01-01'))).toEqual(generateSchedule(lse3Canonical, [], d('2027-01-01')));
  });

  describe('validateAmendment', () => {
    const schedule = generateSchedule(lse3Canonical, [], d('2027-01-01'));
    const asOf = d('2026-10-07');

    it('accepts a future period start and returns that period', () => {
      const result = validateAmendment(schedule, rentTo12M, asOf);
      expect(result).toMatchObject({ ok: true, value: { start: '2026-12-01', end: '2026-12-31' } });
    });

    it('refuses a start on or before as-of', () => {
      expect(validateAmendment(schedule, { ...rentTo12M, effectivePeriodStart: d('2026-09-01') }, asOf)).toEqual({ ok: false, reason: 'not_after_as_of' });
      expect(validateAmendment(schedule, { ...rentTo12M, effectivePeriodStart: d('2026-10-07') }, asOf)).toEqual({ ok: false, reason: 'not_after_as_of' });
    });

    it('refuses a start that is not a period start', () => {
      expect(validateAmendment(schedule, { ...rentTo12M, effectivePeriodStart: d('2026-12-15') }, asOf)).toEqual({ ok: false, reason: 'not_a_period_start' });
    });

    const rentTo12MFromJanuary: Amendment = { effectivePeriodStart: d('2027-01-01'), changes: { rentVnd: vnd(12_000_000) } };
    const quarterlyFromDecember: Amendment = { effectivePeriodStart: d('2026-12-01'), changes: { billingCycleMonths: 3 } };
    const withJanuary = generateSchedule(lse3Canonical, [rentTo12MFromJanuary], d('2027-06-01'));

    it('refuses an amendment that moves a later amendment off the period grid', () => {
      expect(validateAmendment(withJanuary, quarterlyFromDecember, asOf)).toEqual({ ok: false, reason: 'moves_later_amendment' });
    });

    it('accepts a cycle change that keeps every later amendment on a period start, and the result generates', () => {
      const rentFromMarch: Amendment = { effectivePeriodStart: d('2027-03-01'), changes: { rentVnd: vnd(12_000_000) } };
      const withMarch = generateSchedule(lse3Canonical, [rentFromMarch], d('2027-06-01'));
      expect(validateAmendment(withMarch, quarterlyFromDecember, asOf)).toMatchObject({ ok: true, value: { start: '2026-12-01', end: '2027-02-28' } });
      expect(spans(generateSchedule(lse3Canonical, [rentFromMarch, quarterlyFromDecember], d('2027-03-01'))).slice(-2)).toEqual([
        '2026-12-01..2027-02-28',
        '2027-03-01..2027-05-31',
      ]);
    });

    it('refuses a second amendment from the same period start instead of letting input order decide', () => {
      const rentTo13M: Amendment = { effectivePeriodStart: d('2027-01-01'), changes: { rentVnd: vnd(13_000_000) } };
      expect(validateAmendment(withJanuary, rentTo13M, asOf)).toEqual({ ok: false, reason: 'duplicate_effective_start' });
      expect(() => generateSchedule(lse3Canonical, [rentTo12MFromJanuary, rentTo13M], d('2027-02-01'))).toThrow(RangeError);
    });
  });
});
