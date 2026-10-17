import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { addMonths } from '../schedule/dates';
import { generateSchedule } from '../schedule/generate';
import type { BillingCycleMonths, LeaseTerms } from '../schedule/types';
import { attributeRevenue, periodsFromSchedule, type OwnershipShare } from './attribute';
import { computeTaxPosition } from './position';
import { taxRuleRowSchema } from './rules';

const rule = taxRuleRowSchema.parse({
  kind: 'vn_rental_individual',
  effective_from: '2026-01-01',
  effective_to: null,
  params: {
    threshold_vnd: 500_000_000,
    threshold_scope: 'all_business_revenue_of_person',
    vat_rate_bp: 500,
    vat_base: 'total_rental_revenue_when_over_threshold',
    pit_rate_bp: 500,
    pit_base: 'revenue_above_threshold',
  },
  source_citation: 'bench',
  note: 'bench',
});

const YEAR_END = isoDate('2026-12-31');
const AS_OF = isoDate('2026-10-07');
const CYCLES: BillingCycleMonths[] = [1, 1, 1, 3, 6, 12];
const PARTIES = ['me', 'ryan'];

/** `leases` leases over `properties` properties, a third co-owned 50/50, started up to three years back. */
function portfolio(leases: number, properties: number) {
  const shares: OwnershipShare[] = Array.from({ length: properties }, (_, p) =>
    p % 3 === 2
      ? [
          { propertyId: `p${p}`, partyId: 'me', shareBp: 5_000 },
          { propertyId: `p${p}`, partyId: 'ryan', shareBp: 5_000 },
        ]
      : [{ propertyId: `p${p}`, partyId: PARTIES[p % 2] as string, shareBp: 10_000 }],
  ).flat();
  const inputs = Array.from({ length: leases }, (_, i) => {
    const terms: LeaseTerms = {
      startDate: addMonths(isoDate('2024-01-05'), i % 36),
      endDate: null,
      rentVnd: vnd(3_500_000 + (i % 10) * 1_000_000),
      billingCycleMonths: CYCLES[i % CYCLES.length] as BillingCycleMonths,
      periodAnchor: i % 2 === 0 ? 'calendar_month' : 'lease_start',
      firstPeriodProration: 'by_days',
      dueOffsetDays: 0,
      escalation: { kind: 'percent', valueBps: 500, everyMonths: 12, roundingVnd: vnd(100_000) },
      paidThroughDate: null,
    };
    return {
      terms,
      lease: {
        id: `l${i}`,
        propertyId: `p${i % properties}`,
        active: true,
        terminatedOn: null,
        taxPayer: i % 7 === 0 ? ('tenant_withholds' as const) : ('owner' as const),
        declaringPartyId: null,
        recurringCharges: i % 4 === 0 ? [{ amountVnd: vnd(200_000), cycleMonths: 1 }] : [],
      },
    };
  });
  return { shares, inputs };
}

function taxPositions({ shares, inputs }: ReturnType<typeof portfolio>) {
  const periods = inputs.flatMap(({ terms, lease }) => periodsFromSchedule(generateSchedule(terms, [], YEAR_END), lease));
  const attribution = attributeRevenue({ periods, shares, year: 2026, asOf: AS_OF });
  return attribution.owners.map((owner) => computeTaxPosition({ rule, attribution: owner, otherBusinessRevenueVnd: vnd(0) }));
}

const FULL_SEED = portfolio(20, 7);
const THOUSAND = portfolio(1_000, 300);

test('a full-seed-sized household (20 leases, 7 properties) stays under 5 ms', async ({ bench }) => {
  expect(taxPositions(FULL_SEED)).toHaveLength(2);
  const result = await bench('tax position, 20 leases', () => {
    taxPositions(FULL_SEED);
  }).run();
  console.info(`tax position, 20 leases: mean ${result.latency.mean.toFixed(3)} ms`);
  expect(result.latency.mean).toBeLessThan(5);
});

test('a 1,000-lease portfolio stays under 100 ms', async ({ bench }) => {
  const result = await bench('tax position, 1000 leases', () => {
    taxPositions(THOUSAND);
  }).run();
  console.info(`tax position, 1000 leases: mean ${result.latency.mean.toFixed(3)} ms`);
  expect(result.latency.mean).toBeLessThan(100);
});
