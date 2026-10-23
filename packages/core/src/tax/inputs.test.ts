import { describe, expect, it } from 'vitest';
import { addDays, addMonths } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { TaxLease } from './attribute';
import { ownershipShareRowSchema, taxLeaseRowSchema, toTaxInputs, type TaxRows } from './inputs';
import { computeTaxPosition } from './position';
import { taxRuleRowSchema } from './rules';

const RULE = taxRuleRowSchema.parse({
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
  source_citation: 'Nguồn Demo',
  note: null,
});

const ME = '00000000-0000-4000-8000-0000000000a1';
const RYAN = '00000000-0000-4000-8000-0000000000a2';
const ASOF = isoDate('2026-10-07');

function lease(id: string, propertyId: string, change: Partial<TaxLease> = {}): TaxLease {
  return { id, propertyId, active: true, terminatedOn: null, taxPayer: 'owner', declaringPartyId: null, recurringCharges: [], ...change };
}

/** Monthly periods from `start` for `months` months, the way `public.lease_schedule` plans a calendar-month lease. */
function monthly(leaseId: string, start: string, months: number, rent: number) {
  return Array.from({ length: months }, (_, i) => {
    const from = addMonths(isoDate(start), i);
    return { leaseId, start: from, end: addDays(addMonths(from, 1), -1), rentVnd: vnd(rent) };
  });
}

function rows(change: Partial<TaxRows>): TaxRows {
  return { leases: [], schedule: [], shares: [], rules: [RULE], otherBusinessRevenueVnd: vnd(0), ...change };
}

const position = (input: ReturnType<typeof toTaxInputs>) => {
  if (input.kind !== 'rule') throw new Error('expected a rule');
  return computeTaxPosition(input);
};

describe('toTaxInputs', () => {
  it('returns no_rule for a year the rules do not cover', () => {
    expect(toTaxInputs(rows({}), { partyId: ME, year: 2025, asOf: ASOF })).toEqual({ kind: 'no_rule', year: 2025 });
  });

  it('projects an active lease to 31 December and splits accrued at the as-of date (E1)', () => {
    const input = toTaxInputs(
      rows({ leases: [lease('l1', 'p1')], schedule: monthly('l1', '2026-01-01', 12, 30_000_000), shares: [{ propertyId: 'p1', partyId: ME, shareBp: 10_000 }] }),
      { partyId: ME, year: 2026, asOf: isoDate('2026-06-30') },
    );
    const result = position(input);
    expect(result.projectedVnd).toBe(360_000_000);
    expect(result.accruedVnd).toBe(180_000_000);
    expect([result.vatEstimateVnd, result.pitEstimateVnd]).toEqual([0, 0]);
  });

  it('stops an ended lease at its last period and a terminated one at its day', () => {
    const input = toTaxInputs(
      rows({
        leases: [lease('ended', 'p1', { active: false }), lease('cut', 'p1', { active: false, terminatedOn: isoDate('2026-03-15') })],
        schedule: [...monthly('ended', '2026-01-01', 6, 10_000_000), ...monthly('cut', '2026-01-01', 12, 31_000_000)],
        shares: [{ propertyId: 'p1', partyId: ME, shareBp: 10_000 }],
      }),
      { partyId: ME, year: 2026, asOf: ASOF },
    );
    const result = position(input);
    expect(result.projectedVnd).toBe(60_000_000 + 31_000_000 + 31_000_000 + 15_000_000);
    expect(result.accruedVnd).toBe(result.projectedVnd);
  });

  describe('a terminated lease read from its row', () => {
    const terminated = (terminatedOn: string) => {
      const row = taxLeaseRowSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        property_id: '00000000-0000-4000-8000-000000000002',
        status: 'terminated',
        terminated_on: terminatedOn,
        tax_payer: 'owner',
        declaring_party_id: null,
      });
      return position(
        toTaxInputs(
          rows({ leases: [row], schedule: monthly(row.id, '2026-01-01', 12, 10_000_000), shares: [{ propertyId: row.propertyId, partyId: ME, shareBp: 10_000 }] }),
          { partyId: ME, year: 2026, asOf: ASOF },
        ),
      );
    };

    it('projects the rent from the as-of date to a later termination day', () => {
      expect(terminated('2026-12-15')).toMatchObject({ accruedVnd: 92_258_065, projectedVnd: 114_838_710 });
    });

    it('projects nothing past an earlier termination day', () => {
      expect(terminated('2026-03-15')).toMatchObject({ accruedVnd: 24_838_710, projectedVnd: 24_838_710 });
    });

    it('projects nothing past a termination on the as-of date', () => {
      expect(terminated('2026-10-07')).toMatchObject({ accruedVnd: 92_258_065, projectedVnd: 92_258_065 });
    });
  });

  it('splits a co-owned lease by share and gives a declared lease to its declaring party (E5)', () => {
    const shares = [
      { propertyId: 'shared', partyId: ME, shareBp: 5_000 },
      { propertyId: 'shared', partyId: RYAN, shareBp: 5_000 },
    ];
    const base = rows({
      leases: [lease('co', 'shared'), lease('declared', 'shared', { declaringPartyId: RYAN })],
      schedule: [...monthly('co', '2026-01-01', 12, 66_666_667), ...monthly('declared', '2026-01-01', 12, 1_000_000)],
      shares,
    });
    const mine = toTaxInputs(base, { partyId: ME, year: 2026, asOf: ASOF });
    const ryans = toTaxInputs(base, { partyId: RYAN, year: 2026, asOf: ASOF });
    if (mine.kind !== 'rule' || ryans.kind !== 'rule') throw new Error('expected a rule');
    expect(mine.attribution.leases.map((row) => [row.leaseId, row.basis])).toEqual([['co', { kind: 'ownership_share', shareBp: 5_000 }]]);
    expect(ryans.attribution.leases.map((row) => row.leaseId).sort()).toEqual(['co', 'declared']);
    expect(mine.attribution.projectedVnd + ryans.attribution.projectedVnd).toBe(12 * 66_666_667 + 12_000_000);
    expect(position(mine).noteKeys).toContain('co_owner_split');
  });

  it('counts a withheld lease toward the threshold but not the owner-paid estimate (E6)', () => {
    const result = position(
      toTaxInputs(
        rows({
          leases: [lease('own', 'p1'), lease('withheld', 'p2', { taxPayer: 'tenant_withholds' })],
          schedule: [...monthly('own', '2026-01-01', 10, 50_000_000), ...monthly('withheld', '2026-01-01', 10, 20_000_000)],
          shares: [
            { propertyId: 'p1', partyId: ME, shareBp: 10_000 },
            { propertyId: 'p2', partyId: ME, shareBp: 10_000 },
          ],
        }),
        { partyId: ME, year: 2026, asOf: ASOF },
      ),
    );
    expect(result.projectedVnd).toBe(700_000_000);
    expect(result.selfDeclaredVnd).toBe(500_000_000);
    expect(result.withheldLeases.map((row) => [row.leaseId, row.projectedVnd])).toEqual([['withheld', 200_000_000]]);
    expect(result.withheldVnd).toBe(200_000_000);
    expect([result.vatEstimateVnd, result.pitEstimateVnd]).toEqual([25_000_000, 0]);
  });

  it('adds other business revenue to the threshold total and turns on the accountant note (E7)', () => {
    const result = position(
      toTaxInputs(
        rows({
          leases: [lease('l1', 'p1')],
          schedule: monthly('l1', '2026-01-01', 12, 37_500_000),
          shares: [{ propertyId: 'p1', partyId: ME, shareBp: 10_000 }],
          otherBusinessRevenueVnd: vnd(100_000_000),
        }),
        { partyId: ME, year: 2026, asOf: ASOF },
      ),
    );
    expect(result.thresholdTotalVnd).toBe(550_000_000);
    expect([result.vatEstimateVnd, result.pitEstimateVnd]).toEqual([22_500_000, 0]);
    expect(result.noteKeys).toContain('deduction_split');
  });

  it('gives an owner with no attributed lease zero revenue under the rule', () => {
    const input = toTaxInputs(rows({ leases: [lease('l1', 'p1')], schedule: monthly('l1', '2026-01-01', 12, 1_000_000), shares: [{ propertyId: 'p1', partyId: RYAN, shareBp: 10_000 }] }), {
      partyId: ME,
      year: 2026,
      asOf: ASOF,
    });
    expect(input).toMatchObject({ kind: 'rule', attribution: { partyId: ME, accruedVnd: 0, projectedVnd: 0, leases: [] } });
  });
});

describe('tax row schemas', () => {
  const row = { id: '00000000-0000-4000-8000-000000000001', property_id: '00000000-0000-4000-8000-000000000002', terminated_on: null, tax_payer: 'owner', declaring_party_id: null };

  it('reads an ended lease as the only one with no remainder to project', () => {
    expect(taxLeaseRowSchema.parse({ ...row, status: 'active' }).active).toBe(true);
    expect(taxLeaseRowSchema.parse({ ...row, status: 'terminated', terminated_on: '2026-03-15' })).toMatchObject({ active: true, terminatedOn: '2026-03-15' as IsoDate });
    expect(taxLeaseRowSchema.parse({ ...row, status: 'ended' }).active).toBe(false);
  });

  it('refuses a draft lease and a share outside 1 to 10000 bp', () => {
    expect(taxLeaseRowSchema.safeParse({ ...row, status: 'draft' }).success).toBe(false);
    expect(ownershipShareRowSchema.safeParse({ property_id: row.property_id, party_id: row.id, share_bp: 0 }).success).toBe(false);
  });
});
