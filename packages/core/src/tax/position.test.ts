import { describe, expect, it } from 'vitest';
import taxRules from '../../../../supabase/seed/reference/tax_rules.json';
import { vnd } from '../money/vnd';
import type { LeaseRevenue, OwnerRevenue } from './attribute';
import { runWorkedExample, TAX_WORKED_EXAMPLES } from './examples';
import { computeTaxPosition } from './position';
import { selectTaxRule, taxRuleRowSchema, type TaxRule } from './rules';

const seeded: TaxRule = taxRuleRowSchema.parse(taxRules[0]);

function lease(projected: number, taxPayer: LeaseRevenue['taxPayer'] = 'owner', shareBp = 10_000): LeaseRevenue {
  return {
    leaseId: `lease-${projected}-${taxPayer}`,
    propertyId: 'home',
    taxPayer,
    basis: { kind: 'ownership_share', shareBp },
    accruedVnd: vnd(0),
    projectedVnd: vnd(projected),
  };
}

function owner(...leases: LeaseRevenue[]): OwnerRevenue {
  const projected = leases.reduce((sum, item) => sum + item.projectedVnd, 0);
  return { partyId: 'owner-a', accruedVnd: vnd(0), projectedVnd: vnd(projected), leases };
}

const position = (attribution: OwnerRevenue, other = 0) =>
  computeTaxPosition({ rule: seeded, attribution, otherBusinessRevenueVnd: vnd(other) });

describe('DOMAIN-VN §5 worked examples (FIN-3)', () => {
  it.each(TAX_WORKED_EXAMPLES.map((example) => [example.id, example] as const))('%s', (_id, example) => {
    expect(runWorkedExample(example, seeded)).toEqual(example.expected);
  });

  it('E7 reads 22,500,000 VAT, 0 PIT and carries the deduction_split note', () => {
    const e7 = TAX_WORKED_EXAMPLES.find((example) => example.id === 'E7');
    if (e7 === undefined) throw new Error('E7 is missing');
    const [row] = runWorkedExample(e7, seeded);
    expect(row).toMatchObject({ thresholdTotalVnd: 550_000_000, vatVnd: 22_500_000, pitVnd: 0 });
    expect(row?.notes).toContain('deduction_split');
  });

  it('pins the table values themselves, not only the runner', () => {
    const rows = TAX_WORKED_EXAMPLES.flatMap((example) =>
      example.expected.map((row) => [example.id, row.revenueVnd, row.vatVnd, row.pitVnd]),
    );
    expect(rows).toEqual([
      ['E1', 360_000_000, 0, 0],
      ['E2', 600_000_000, 30_000_000, 5_000_000],
      ['E3', 900_000_000, 45_000_000, 20_000_000],
      ['E4', 450_000_000, 0, 0],
      ['E5', 400_000_000, 0, 0],
      ['E5', 400_000_000, 0, 0],
      ['E6', 700_000_000, 25_000_000, 0],
      ['E7', 450_000_000, 22_500_000, 0],
    ]);
  });
});

describe('computeTaxPosition', () => {
  it('charges nothing at exactly 500,000,000', () => {
    expect(position(owner(lease(500_000_000)))).toMatchObject({
      overThreshold: false,
      remainingToThresholdVnd: 0,
      progressBp: 10_000,
      vatEstimateVnd: 0,
      pitEstimateVnd: 0,
    });
  });

  it('charges VAT on the whole revenue at 500,000,001 and PIT on the one đồng above', () => {
    expect(position(owner(lease(500_000_001)))).toMatchObject({
      overThreshold: true,
      remainingToThresholdVnd: 0,
      vatEstimateVnd: 25_000_000,
      pitEstimateVnd: 0,
    });
  });

  it('rounds basis-point products half up to whole đồng', () => {
    expect(position(owner(lease(500_000_010))).pitEstimateVnd).toBe(1);
    expect(position(owner(lease(500_000_009))).pitEstimateVnd).toBe(0);
    expect(position(owner(lease(500_000_030))).vatEstimateVnd).toBe(25_000_002);
  });

  it('reports remaining to threshold and rounds progress down', () => {
    expect(position(owner(lease(499_999_999)))).toMatchObject({ remainingToThresholdVnd: 1, progressBp: 9_999 });
    expect(position(owner(lease(360_000_000)))).toMatchObject({ remainingToThresholdVnd: 140_000_000, progressBp: 7_200 });
  });

  it('counts other business revenue toward the threshold only', () => {
    expect(position(owner(lease(450_000_000)), 49_999_999)).toMatchObject({ overThreshold: false, vatEstimateVnd: 0 });
    expect(position(owner(lease(450_000_000)), 50_000_001)).toMatchObject({
      thresholdTotalVnd: 500_000_001,
      overThreshold: true,
      vatEstimateVnd: 22_500_000,
      pitEstimateVnd: 0,
    });
  });

  it('lists withheld leases and keeps them out of self-declared revenue', () => {
    const withheld = lease(200_000_000, 'tenant_withholds');
    const result = position(owner(lease(500_000_000), withheld));
    expect(result.withheldLeases).toEqual([
      { leaseId: withheld.leaseId, propertyId: 'home', accruedVnd: 0, projectedVnd: 200_000_000 },
    ]);
    expect(result).toMatchObject({ thresholdTotalVnd: 700_000_000, selfDeclaredVnd: 500_000_000, withheldVnd: 200_000_000 });
  });

  it('activates notes from the registry', () => {
    expect(position(owner(lease(100_000_000))).noteKeys).toEqual(['estimate_disclaimer', 'pit_effective_date', 'utility_excluded']);
    expect(position(owner(lease(100_000_000, 'owner', 5_000)), 1).noteKeys).toEqual([
      'estimate_disclaimer',
      'pit_effective_date',
      'co_owner_split',
      'deduction_split',
      'utility_excluded',
    ]);
    const noNote = { ...seeded, note: null };
    expect(computeTaxPosition({ rule: noNote, attribution: owner(), otherBusinessRevenueVnd: vnd(0) }).noteKeys).not.toContain(
      'pit_effective_date',
    );
  });

  it('carries the rule source and note', () => {
    expect(position(owner())).toMatchObject({ sourceCitation: seeded.sourceCitation, ruleNote: seeded.note });
  });

  it('has no rule for 2025', () => {
    expect(selectTaxRule([seeded], 2025)).toEqual({ kind: 'no_rule', year: 2025 });
  });
});

