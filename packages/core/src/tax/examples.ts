import { addDays, addMonths } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { attributeRevenue, periodsFromSchedule, type OwnershipShare, type RevenuePeriod, type TaxPayer } from './attribute';
import { TAX_NOTES, type TaxNoteKey } from './notes';
import { computeTaxPosition } from './position';
import type { TaxRule } from './rules';

export type WorkedExampleOwner = {
  partyId: string;
  revenueVnd: Vnd;
  thresholdTotalVnd: Vnd;
  selfDeclaredVnd: Vnd;
  vatVnd: Vnd;
  pitVnd: Vnd;
  withheldVnd: Vnd;
  notes: readonly TaxNoteKey[];
};

export type WorkedExample = {
  id: 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7';
  year: number;
  asOf: IsoDate;
  periods: readonly RevenuePeriod[];
  shares: readonly OwnershipShare[];
  otherBusinessRevenueVnd: Vnd;
  /** DOMAIN-VN §5 figures, one row per owner. */
  expected: readonly WorkedExampleOwner[];
};

const YEAR = 2026;
const AS_OF = '2026-10-07' as IsoDate;
const JAN_1 = '2026-01-01' as IsoDate;
const ALWAYS: readonly TaxNoteKey[] = ['estimate_disclaimer', 'pit_effective_date', 'utility_excluded'];

/** A lease billing `monthlyRentVnd` every calendar month of 2026, as `public.lease_schedule` plans it. */
function monthlyLease(id: string, propertyId: string, monthlyRentVnd: number): RevenuePeriod[] {
  const months = Array.from({ length: 12 }, (_, i) => ({
    start: addMonths(JAN_1, i),
    end: addDays(addMonths(JAN_1, i + 1), -1),
    rentVnd: vnd(monthlyRentVnd),
  }));
  return periodsFromSchedule(months, {
    id,
    propertyId,
    active: true,
    terminatedOn: null,
    taxPayer: 'owner',
    declaringPartyId: null,
    recurringCharges: [],
  });
}

function singlePeriod(id: string, propertyId: string, start: string, end: string, amountVnd: number, taxPayer: TaxPayer): RevenuePeriod {
  return {
    leaseId: id,
    propertyId,
    start: start as IsoDate,
    end: end as IsoDate,
    amountVnd: vnd(amountVnd),
    taxPayer,
    declaringPartyId: null,
    active: true,
  };
}

function owner(partyId: string, figures: Omit<WorkedExampleOwner, 'partyId' | 'notes'>, notes: readonly TaxNoteKey[] = []): WorkedExampleOwner {
  const keys = [...ALWAYS, ...notes];
  return { partyId, ...figures, notes: (Object.keys(TAX_NOTES) as TaxNoteKey[]).filter((key) => keys.includes(key)) };
}

const sole = (propertyId: string, partyId = 'owner-a'): OwnershipShare => ({ propertyId, partyId, shareBp: 10_000 });

const figures = (revenue: number, vat: number, pit: number, other = 0, withheld = 0) => ({
  revenueVnd: vnd(revenue),
  thresholdTotalVnd: vnd(revenue + other),
  selfDeclaredVnd: vnd(revenue - withheld),
  vatVnd: vnd(vat),
  pitVnd: vnd(pit),
  withheldVnd: vnd(withheld),
});

const base = { year: YEAR, asOf: AS_OF, otherBusinessRevenueVnd: vnd(0) };

export const TAX_WORKED_EXAMPLES: readonly WorkedExample[] = [
  {
    ...base,
    id: 'E1',
    periods: monthlyLease('e1-lease', 'e1-home', 30_000_000),
    shares: [sole('e1-home')],
    expected: [owner('owner-a', figures(360_000_000, 0, 0))],
  },
  {
    ...base,
    id: 'E2',
    periods: monthlyLease('e2-lease', 'e2-home', 50_000_000),
    shares: [sole('e2-home')],
    expected: [owner('owner-a', figures(600_000_000, 30_000_000, 5_000_000))],
  },
  {
    ...base,
    id: 'E3',
    periods: monthlyLease('e3-lease', 'e3-home', 75_000_000),
    shares: [sole('e3-home')],
    expected: [owner('owner-a', figures(900_000_000, 45_000_000, 20_000_000))],
  },
  {
    ...base,
    id: 'E4',
    periods: [singlePeriod('e4-lease', 'e4-home', '2026-01-01', '2027-12-31', 900_000_000, 'owner')],
    shares: [sole('e4-home')],
    expected: [owner('owner-a', figures(450_000_000, 0, 0))],
  },
  {
    ...base,
    id: 'E5',
    periods: [singlePeriod('e5-lease', 'e5-home', '2026-01-01', '2026-12-31', 800_000_000, 'owner')],
    shares: [
      { propertyId: 'e5-home', partyId: 'owner-a', shareBp: 5_000 },
      { propertyId: 'e5-home', partyId: 'owner-b', shareBp: 5_000 },
    ],
    expected: [
      owner('owner-a', figures(400_000_000, 0, 0), ['co_owner_split']),
      owner('owner-b', figures(400_000_000, 0, 0), ['co_owner_split']),
    ],
  },
  {
    ...base,
    id: 'E6',
    periods: [
      singlePeriod('e6-own', 'e6-shop', '2026-01-01', '2026-12-31', 500_000_000, 'owner'),
      singlePeriod('e6-withheld', 'e6-office', '2026-01-01', '2026-12-31', 200_000_000, 'tenant_withholds'),
    ],
    shares: [sole('e6-shop'), sole('e6-office')],
    expected: [owner('owner-a', figures(700_000_000, 25_000_000, 0, 0, 200_000_000))],
  },
  {
    ...base,
    id: 'E7',
    periods: monthlyLease('e7-lease', 'e7-home', 37_500_000),
    shares: [sole('e7-home')],
    otherBusinessRevenueVnd: vnd(100_000_000),
    expected: [owner('owner-a', figures(450_000_000, 22_500_000, 0, 100_000_000), ['deduction_split'])],
  },
];

/** Computes each expected owner's figures through `attributeRevenue` and `computeTaxPosition`, in the shape of `expected`. */
export function runWorkedExample(example: WorkedExample, rule: TaxRule): WorkedExampleOwner[] {
  const attribution = attributeRevenue(example);
  return attribution.owners.map((revenue) => {
    const position = computeTaxPosition({ rule, attribution: revenue, otherBusinessRevenueVnd: example.otherBusinessRevenueVnd });
    return {
      partyId: revenue.partyId,
      revenueVnd: position.projectedVnd,
      thresholdTotalVnd: position.thresholdTotalVnd,
      selfDeclaredVnd: position.selfDeclaredVnd,
      vatVnd: position.vatEstimateVnd,
      pitVnd: position.pitEstimateVnd,
      withheldVnd: vnd(position.withheldLeases.reduce((sum, lease) => sum + lease.projectedVnd, 0)),
      notes: position.noteKeys,
    };
  });
}
