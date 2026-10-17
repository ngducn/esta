import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { generateSchedule } from '../schedule/generate';
import type { LeaseTerms } from '../schedule/types';
import { attributeRevenue, periodsFromSchedule, splitAmountByDays, type RevenuePeriod, type TaxLease } from './attribute';

const d = isoDate;

function period(start: string, end: string, amount: number, change: Partial<RevenuePeriod> = {}): RevenuePeriod {
  return {
    leaseId: 'lease-1',
    propertyId: 'home',
    start: d(start),
    end: d(end),
    amountVnd: vnd(amount),
    taxPayer: 'owner',
    declaringPartyId: null,
    active: true,
    ...change,
  };
}

const sole = [{ propertyId: 'home', partyId: 'me', shareBp: 10_000 }];

function attribute(periods: RevenuePeriod[], asOf: string, shares = sole, year = 2026) {
  return attributeRevenue({ periods, shares, year, asOf: d(asOf) });
}

describe('splitAmountByDays', () => {
  it('splits by days and sums to the amount exactly', () => {
    const parts = splitAmountByDays(vnd(100), { start: d('2026-01-01'), end: d('2026-01-03') }, [d('2026-01-02'), d('2026-01-03')]);
    expect(parts).toEqual([
      { start: '2026-01-01', end: '2026-01-01', amountVnd: 34 },
      { start: '2026-01-02', end: '2026-01-02', amountVnd: 33 },
      { start: '2026-01-03', end: '2026-01-03', amountVnd: 33 },
    ]);
  });

  it('gives the largest remainder the extra đồng, ties to the earlier segment', () => {
    const parts = splitAmountByDays(vnd(10), { start: d('2026-01-01'), end: d('2026-01-07') }, [d('2026-01-04')]);
    expect(parts.map((part) => part.amountVnd)).toEqual([4, 6]);
    const tied = splitAmountByDays(vnd(1), { start: d('2026-01-01'), end: d('2026-01-02') }, [d('2026-01-02')]);
    expect(tied.map((part) => part.amountVnd)).toEqual([1, 0]);
  });

  it('ignores cuts outside the period, on its first day, and duplicates', () => {
    const parts = splitAmountByDays(vnd(90), { start: d('2026-03-01'), end: d('2026-03-30') }, [
      d('2026-01-01'),
      d('2026-03-01'),
      d('2026-03-16'),
      d('2026-03-16'),
      d('2026-04-01'),
    ]);
    expect(parts).toEqual([
      { start: '2026-03-01', end: '2026-03-15', amountVnd: 45 },
      { start: '2026-03-16', end: '2026-03-30', amountVnd: 45 },
    ]);
  });

  it('stays exact for amounts whose product with days exceeds 2^53', () => {
    const big = vnd(4_000_000_000_000_001);
    const parts = splitAmountByDays(big, { start: d('2026-01-01'), end: d('2027-12-31') }, [d('2027-01-01')]);
    expect(parts.reduce((sum, part) => sum + BigInt(part.amountVnd), 0n)).toBe(BigInt(big));
  });
});

describe('attributeRevenue', () => {
  it('pro-rates a quarterly period straddling 31 December', () => {
    const result = attribute([period('2026-11-01', '2027-01-31', 92_000_000)], '2026-10-07');
    expect(result.owners[0]).toMatchObject({ accruedVnd: 0, projectedVnd: 61_000_000 });
    const next = attribute([period('2026-11-01', '2027-01-31', 92_000_000)], '2027-12-31', sole, 2027);
    expect(next.owners[0]).toMatchObject({ accruedVnd: 31_000_000, projectedVnd: 31_000_000 });
  });

  it('keeps a year total of an active lease the same whatever the as-of date', () => {
    const straddle = [period('2026-12-15', '2027-01-14', 10_000_001)];
    for (const asOf of ['2026-10-07', '2026-12-20', '2026-12-31']) {
      expect(attribute(straddle, asOf).owners[0]?.projectedVnd).toBe(5_483_872);
    }
  });

  it('never splits a period into year shares that add up to more than its amount', () => {
    const straddle = [period('2026-12-30', '2027-01-01', 2)];
    const thisYear = attribute(straddle, '2026-12-30').owners[0]?.projectedVnd ?? 0;
    const nextYear = attribute(straddle, '2026-12-30', sole, 2027).owners[0]?.projectedVnd ?? 0;
    expect([thisYear, nextYear]).toEqual([1, 1]);
  });

  it('counts 29 February in a 2028 leap-year period', () => {
    const result = attribute([period('2028-02-01', '2028-02-29', 29_000_000)], '2028-02-28', sole, 2028);
    expect(result.owners[0]).toMatchObject({ accruedVnd: 28_000_000, projectedVnd: 29_000_000 });
  });

  it('accrues through the as-of day inclusive', () => {
    const result = attribute([period('2026-10-01', '2026-10-31', 31_000_000)], '2026-10-07');
    expect(result.owners[0]).toMatchObject({ accruedVnd: 7_000_000, projectedVnd: 31_000_000 });
  });

  it('gives the whole lease to the declaring party', () => {
    const result = attribute(
      [period('2026-01-01', '2026-12-31', 365_000_000, { declaringPartyId: 'ryan' })],
      '2026-12-31',
      [
        { propertyId: 'home', partyId: 'me', shareBp: 5_000 },
        { propertyId: 'home', partyId: 'ryan', shareBp: 5_000 },
      ],
    );
    expect(result.owners).toEqual([
      {
        partyId: 'ryan',
        accruedVnd: 365_000_000,
        projectedVnd: 365_000_000,
        leases: [
          {
            leaseId: 'lease-1',
            propertyId: 'home',
            taxPayer: 'owner',
            basis: { kind: 'declaring_party' },
            accruedVnd: 365_000_000,
            projectedVnd: 365_000_000,
          },
        ],
      },
    ]);
  });

  it('splits E5 800M 50/50 into 400M each', () => {
    const result = attribute([period('2026-01-01', '2026-12-31', 800_000_000)], '2026-10-07', [
      { propertyId: 'home', partyId: 'me', shareBp: 5_000 },
      { propertyId: 'home', partyId: 'ryan', shareBp: 5_000 },
    ]);
    expect(result.owners.map((owner) => [owner.partyId, owner.projectedVnd])).toEqual([
      ['me', 400_000_000],
      ['ryan', 400_000_000],
    ]);
    expect(result.unattributed).toEqual({ accruedVnd: 0, projectedVnd: 0 });
  });

  it('leaves the missing share unattributed when shares sum to 9000 bp', () => {
    const result = attribute([period('2026-01-01', '2026-12-31', 100_000_000)], '2026-12-31', [
      { propertyId: 'home', partyId: 'me', shareBp: 6_000 },
      { propertyId: 'home', partyId: 'ryan', shareBp: 3_000 },
    ]);
    expect(result.owners.map((owner) => [owner.partyId, owner.projectedVnd])).toEqual([
      ['me', 60_000_000],
      ['ryan', 30_000_000],
    ]);
    expect(result.unattributed).toEqual({ accruedVnd: 10_000_000, projectedVnd: 10_000_000 });
  });

  it('splits shares that sum above 10000 bp in proportion without inflating revenue', () => {
    const result = attribute([period('2026-01-01', '2026-12-31', 120_000_000)], '2026-12-31', [
      { propertyId: 'home', partyId: 'me', shareBp: 10_000 },
      { propertyId: 'home', partyId: 'ryan', shareBp: 2_000 },
    ]);
    expect(result.owners.map((owner) => owner.projectedVnd)).toEqual([100_000_000, 20_000_000]);
  });

  it('leaves revenue of a property with no shares unattributed', () => {
    const result = attribute([period('2026-01-01', '2026-12-31', 50_000_000)], '2026-10-07', []);
    expect(result.owners).toEqual([]);
    expect(result.unattributed.projectedVnd).toBe(50_000_000);
  });

  it('projects the remainder only for active leases', () => {
    const ended = attribute([period('2026-01-01', '2026-12-31', 365_000_000, { active: false })], '2026-10-07');
    expect(ended.owners[0]).toMatchObject({ accruedVnd: 280_000_000, projectedVnd: 280_000_000 });
  });

  it('accrues nothing for a year after the as-of date and everything for a year before it', () => {
    const periods = [period('2025-01-01', '2025-12-31', 365_000_000), period('2027-01-01', '2027-12-31', 365_000_000)];
    expect(attribute(periods, '2026-10-07', sole, 2025).owners[0]).toMatchObject({ accruedVnd: 365_000_000, projectedVnd: 365_000_000 });
    expect(attribute(periods, '2026-10-07', sole, 2027).owners[0]).toMatchObject({ accruedVnd: 0, projectedVnd: 365_000_000 });
  });
});

const PAID_THROUGH_YEAR_END: LeaseTerms = {
  startDate: d('2026-01-01'),
  endDate: null,
  rentVnd: vnd(10_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'none',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: d('2026-12-31'),
};

const taxLease: TaxLease = {
  id: 'lease-1',
  propertyId: 'home',
  active: true,
  terminatedOn: null,
  taxPayer: 'owner',
  declaringPartyId: null,
  recurringCharges: [],
};

describe('periodsFromSchedule', () => {
  const schedule = (terms: LeaseTerms, until: string) => generateSchedule(terms, [], d(until));

  it('keeps periods paid through 2026-12-31, so they still accrue', () => {
    const periods = periodsFromSchedule(schedule(PAID_THROUGH_YEAR_END, '2026-12-31'), taxLease);
    expect(periods).toHaveLength(12);
    expect(attribute(periods, '2026-10-07').owners[0]).toMatchObject({ accruedVnd: 92_258_065, projectedVnd: 120_000_000 });
  });

  it('stops a terminated lease at terminated_on, cutting the last period by days', () => {
    const periods = periodsFromSchedule(schedule(PAID_THROUGH_YEAR_END, '2026-12-31'), {
      ...taxLease,
      active: false,
      terminatedOn: d('2026-03-10'),
    });
    expect(periods.map((p) => [p.start, p.end, p.amountVnd])).toEqual([
      ['2026-01-01', '2026-01-31', 10_000_000],
      ['2026-02-01', '2026-02-28', 10_000_000],
      ['2026-03-01', '2026-03-10', 3_225_806],
    ]);
  });

  it('ends at end_date through the schedule itself', () => {
    const periods = periodsFromSchedule(schedule({ ...PAID_THROUGH_YEAR_END, endDate: d('2026-02-14') }, '2026-12-31'), taxLease);
    expect(periods.map((p) => p.end)).toEqual(['2026-01-31', '2026-02-14']);
  });

  it('adds recurring charges on their own cycle across the schedule span', () => {
    const periods = periodsFromSchedule(schedule(PAID_THROUGH_YEAR_END, '2026-12-31'), {
      ...taxLease,
      recurringCharges: [{ amountVnd: vnd(600_000), cycleMonths: 3 }],
    });
    const charges = periods.slice(12);
    expect(charges.map((p) => [p.start, p.end, p.amountVnd])).toEqual([
      ['2026-01-01', '2026-03-31', 600_000],
      ['2026-04-01', '2026-06-30', 600_000],
      ['2026-07-01', '2026-09-30', 600_000],
      ['2026-10-01', '2026-12-31', 600_000],
    ]);
    expect(attribute(periods, '2026-12-31').owners[0]?.projectedVnd).toBe(122_400_000);
  });

  it('rejects a recurring charge with no cycle', () => {
    expect(() =>
      periodsFromSchedule(schedule(PAID_THROUGH_YEAR_END, '2026-12-31'), {
        ...taxLease,
        recurringCharges: [{ amountVnd: vnd(1), cycleMonths: 0 }],
      }),
    ).toThrow(RangeError);
  });

  it('returns nothing for an empty schedule', () => {
    expect(periodsFromSchedule([], taxLease)).toEqual([]);
  });

  it('carries the lease facts onto every period', () => {
    const [first] = periodsFromSchedule(schedule(PAID_THROUGH_YEAR_END, '2026-01-31'), {
      ...taxLease,
      taxPayer: 'tenant_withholds',
      declaringPartyId: 'ryan',
    });
    expect(first).toMatchObject({ leaseId: 'lease-1', propertyId: 'home', taxPayer: 'tenant_withholds', declaringPartyId: 'ryan', active: true });
  });
});

