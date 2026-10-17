import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import taxRules from '../../../../supabase/seed/reference/tax_rules.json';
import { daysBetween } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { addDays } from '../schedule/dates';
import {
  attributeRevenue,
  splitAmountByDays,
  type LeaseRevenue,
  type OwnerRevenue,
  type OwnershipShare,
  type RevenuePeriod,
} from './attribute';
import { computeTaxPosition } from './position';
import { taxRuleRowSchema, type TaxRule } from './rules';

const params = { seed: 20261018, numRuns: 1000 };

const seeded: TaxRule = taxRuleRowSchema.parse(taxRules[0]);

const date = (min: string, max: string) =>
  fc.integer({ min: 0, max: daysBetween(isoDate(min), isoDate(max)) }).map((offset) => addDays(isoDate(min), offset));
const amount = fc.integer({ min: 0, max: 2_000_000_000_000 }).map(vnd);
const PROPERTIES = ['p1', 'p2', 'p3'];
const PARTIES = ['me', 'ryan', 'aunt'];

const revenuePeriod: fc.Arbitrary<RevenuePeriod> = fc
  .record({
    leaseId: fc.constantFrom('l1', 'l2', 'l3', 'l4'),
    start: date('2025-06-01', '2027-06-30'),
    days: fc.integer({ min: 1, max: 800 }),
    amountVnd: amount,
    taxPayer: fc.constantFrom('owner' as const, 'tenant_withholds' as const),
    declaringPartyId: fc.option(fc.constantFrom(...PARTIES), { nil: null }),
    active: fc.boolean(),
  })
  .map(({ leaseId, days, ...rest }) => {
    const index = Number(leaseId.slice(1)) - 1;
    return { ...rest, leaseId, propertyId: PROPERTIES[index % PROPERTIES.length] as string, end: addDays(rest.start, days - 1) };
  });

/** Every period of a lease shares the lease's facts, as periodsFromSchedule produces them. */
const periods = fc.array(revenuePeriod, { maxLength: 12 }).map((list) => {
  const facts = new Map<string, RevenuePeriod>();
  return list.map((period) => {
    const lease = facts.get(period.leaseId) ?? period;
    facts.set(period.leaseId, lease);
    return { ...period, taxPayer: lease.taxPayer, declaringPartyId: lease.declaringPartyId, active: lease.active };
  });
});

const shares: fc.Arbitrary<OwnershipShare[]> = fc.array(
  fc.record({
    propertyId: fc.constantFrom(...PROPERTIES),
    partyId: fc.constantFrom(...PARTIES),
    shareBp: fc.integer({ min: 0, max: 10_000 }),
  }),
  { maxLength: 6 },
);
const asOf = date('2025-12-01', '2027-01-31');
const YEAR = 2026;
const JAN_1 = isoDate('2026-01-01');
const NEXT_JAN_1 = isoDate('2027-01-01');

/** The in-year part of a period through `until`, split at 1 January, the day after the as-of date and the next 1 January. */
function inYear(period: RevenuePeriod, at: IsoDate, until: IsoDate | null): number {
  const afterAsOf = addDays(at, 1);
  const cut = afterAsOf < JAN_1 ? JAN_1 : afterAsOf > NEXT_JAN_1 ? NEXT_JAN_1 : afterAsOf;
  return splitAmountByDays(period.amountVnd, period, [JAN_1, cut, NEXT_JAN_1])
    .filter((segment) => segment.start >= JAN_1 && segment.start < NEXT_JAN_1 && (until === null || segment.start <= until))
    .reduce((sum, segment) => sum + segment.amountVnd, 0);
}

describe('splitAmountByDays properties', () => {
  it('parts are non-negative, contiguous, cover the period and sum to the amount exactly', () => {
    fc.assert(
      fc.property(amount, date('2026-01-01', '2028-12-31'), fc.integer({ min: 1, max: 900 }), fc.array(date('2025-06-01', '2031-06-01'), { maxLength: 8 }), (total, start, days, cuts) => {
        const end = addDays(start, days - 1);
        const parts = splitAmountByDays(total, { start, end }, cuts);
        expect(parts.reduce((sum, part) => sum + part.amountVnd, 0)).toBe(total);
        expect(parts.every((part) => part.amountVnd >= 0 && part.start <= part.end)).toBe(true);
        expect(parts[0]?.start).toBe(start);
        expect(parts.at(-1)?.end).toBe(end);
        parts.slice(1).forEach((part, i) => expect(part.start).toBe(addDays((parts[i] as { end: IsoDate }).end, 1)));
      }),
      params,
    );
  });
});

describe('attributeRevenue properties', () => {
  it('owner revenue plus unattributed equals the in-year sum of period amounts', () => {
    fc.assert(
      fc.property(periods, shares, asOf, (list, shareList, at) => {
        const result = attributeRevenue({ periods: list, shares: shareList, year: YEAR, asOf: at });
        const projected = result.owners.reduce<number>((sum, owner) => sum + owner.projectedVnd, result.unattributed.projectedVnd);
        const accrued = result.owners.reduce<number>((sum, owner) => sum + owner.accruedVnd, result.unattributed.accruedVnd);
        expect(projected).toBe(list.reduce((sum, period) => sum + inYear(period, at, period.active ? null : at), 0));
        expect(accrued).toBe(list.reduce((sum, period) => sum + inYear(period, at, at), 0));
      }),
      params,
    );
  });

  it('with every period inside the year and every lease active, projected revenue is the sum of amounts', () => {
    fc.assert(
      fc.property(periods, shares, asOf, (list, shareList, at) => {
        const inside = list
          .map((period) => ({ ...period, active: true }))
          .filter((period) => period.start >= JAN_1 && period.end < NEXT_JAN_1);
        const result = attributeRevenue({ periods: inside, shares: shareList, year: YEAR, asOf: at });
        const projected = result.owners.reduce<number>((sum, owner) => sum + owner.projectedVnd, result.unattributed.projectedVnd);
        expect(projected).toBe(inside.reduce((sum, period) => sum + period.amountVnd, 0));
      }),
      params,
    );
  });

  it('accrued never exceeds projected, per owner and per lease', () => {
    fc.assert(
      fc.property(periods, shares, asOf, (list, shareList, at) => {
        const result = attributeRevenue({ periods: list, shares: shareList, year: YEAR, asOf: at });
        for (const owner of result.owners) {
          expect(owner.accruedVnd).toBeLessThanOrEqual(owner.projectedVnd);
          expect(owner.leases.every((lease) => lease.accruedVnd <= lease.projectedVnd)).toBe(true);
          expect(owner.leases.reduce((sum, lease) => sum + lease.projectedVnd, 0)).toBe(owner.projectedVnd);
        }
        expect(result.unattributed.accruedVnd).toBeLessThanOrEqual(result.unattributed.projectedVnd);
      }),
      params,
    );
  });
});

const lease = fc.record({
  projected: fc.integer({ min: 0, max: 1_500_000_000 }),
  taxPayer: fc.constantFrom('owner' as const, 'tenant_withholds' as const),
});

function ownerOf(leases: readonly { projected: number; taxPayer: LeaseRevenue['taxPayer'] }[]): OwnerRevenue {
  const rows: LeaseRevenue[] = leases.map((item, i) => ({
    leaseId: `l${i}`,
    propertyId: 'p1',
    taxPayer: item.taxPayer,
    basis: { kind: 'ownership_share', shareBp: 10_000 },
    accruedVnd: vnd(0),
    projectedVnd: vnd(item.projected),
  }));
  return { partyId: 'me', accruedVnd: vnd(0), projectedVnd: vnd(leases.reduce((sum, item) => sum + item.projected, 0)), leases: rows };
}

const other = fc.integer({ min: 0, max: 1_000_000_000 }).map(vnd);
const position = (leases: readonly { projected: number; taxPayer: LeaseRevenue['taxPayer'] }[], otherVnd: Vnd) =>
  computeTaxPosition({ rule: seeded, attribution: ownerOf(leases), otherBusinessRevenueVnd: otherVnd });

describe('computeTaxPosition properties', () => {
  it('keeps remaining to threshold at or above 0 and over threshold strictly above it', () => {
    fc.assert(
      fc.property(fc.array(lease, { maxLength: 6 }), other, (leases, otherVnd) => {
        const result = position(leases, otherVnd);
        expect(result.remainingToThresholdVnd).toBeGreaterThanOrEqual(0);
        expect(result.remainingToThresholdVnd).toBe(Math.max(0, result.thresholdVnd - result.thresholdTotalVnd));
        expect(result.overThreshold).toBe(result.thresholdTotalVnd > result.thresholdVnd);
        expect(result.progressBp >= 10_000).toBe(result.thresholdTotalVnd >= result.thresholdVnd);
      }),
      params,
    );
  });

  it('charges no VAT or PIT at or below the threshold', () => {
    fc.assert(
      fc.property(fc.array(lease, { maxLength: 6 }), other, (leases, otherVnd) => {
        const result = position(leases, otherVnd);
        if (result.thresholdTotalVnd <= result.thresholdVnd) {
          expect(result.vatEstimateVnd).toBe(0);
          expect(result.pitEstimateVnd).toBe(0);
        }
      }),
      params,
    );
  });

  it('never lowers either estimate as revenue grows', () => {
    fc.assert(
      fc.property(
        fc.array(lease, { maxLength: 6 }),
        other,
        lease,
        fc.integer({ min: 0, max: 500_000_000 }).map(vnd),
        (leases, otherVnd, added, moreOther) => {
          const before = position(leases, otherVnd);
          for (const after of [position([...leases, added], otherVnd), position(leases, vnd(otherVnd + moreOther))]) {
            expect(after.vatEstimateVnd).toBeGreaterThanOrEqual(before.vatEstimateVnd);
            expect(after.pitEstimateVnd).toBeGreaterThanOrEqual(before.pitEstimateVnd);
          }
        },
      ),
      params,
    );
  });

  it('self-declared plus withheld equals projected', () => {
    fc.assert(
      fc.property(fc.array(lease, { maxLength: 6 }), other, (leases, otherVnd) => {
        const result = position(leases, otherVnd);
        const withheld = result.withheldLeases.reduce((sum, item) => sum + item.projectedVnd, 0);
        expect(result.selfDeclaredVnd + withheld).toBe(result.projectedVnd);
      }),
      params,
    );
  });
});
