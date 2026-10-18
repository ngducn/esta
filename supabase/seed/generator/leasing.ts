import { isoDate, type IsoDate } from '../../../packages/core/src/date/iso-date.ts';
import { planInvoices, type CompletedReadings, type InvoicingLease, type PlannedInvoice } from '../../../packages/core/src/lease/invoicing.ts';
import { vnd } from '../../../packages/core/src/money/vnd.ts';
import { publicTable, type HouseholdSeed, type SeedContext } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import { propertyCode, type PropertySeedKey } from './properties.ts';
import { rngFor } from './rng.ts';
import { propertyId, unitId, UNIT_SEEDS } from './units.ts';

type Tenant = { readonly kind: 'individual' | 'organization'; readonly fullName: string; readonly phone: string };

type LeaseSeed = {
  readonly property: PropertySeedKey;
  /** 1-based position in UNIT_SEEDS[property]. */
  readonly unit: number;
  readonly tenant: Tenant;
  readonly status: 'active' | 'ended';
  readonly terms: InvoicingLease;
  readonly depositVnd: number;
  readonly taxPayer: 'owner' | 'tenant_withholds';
};

const d = isoDate;

const terms = (startDate: string, endDate: string, rentVnd: number, cycle: 1 | 3 | 12, paidThrough: string, room = false): InvoicingLease => ({
  startDate: d(startDate),
  endDate: d(endDate),
  rentVnd: vnd(rentVnd),
  billingCycleMonths: cycle,
  periodAnchor: room ? 'lease_start' : 'calendar_month',
  firstPeriodProration: 'by_days',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: d(paidThrough),
  utilitiesMode: room ? 'metered_by_owner' : 'tenant_direct',
});

const person = (fullName: string, phone: string): Tenant => ({ kind: 'individual', fullName, phone });
const company = (fullName: string, phone: string): Tenant => ({ kind: 'organization', fullName, phone });

/** Dĩ An rooms bill from the 25th; Phòng 5 still owes the period due 2026-09-25, the rest paid through 2026-10-24. */
const room = (n: number, start: string, rent: number, tenant: Tenant, paidThrough = '2026-10-24'): LeaseSeed => ({
  property: 'di-an',
  unit: n,
  tenant,
  status: 'active',
  terms: terms(start, '2027-06-24', rent, 1, paidThrough, true),
  depositVnd: rent,
  taxPayer: 'owner',
});

/** SPEC §9.3, as of 2026-10-07. Earlier periods count as paid before Esta through `paid_through_date`. */
export const LEASE_SEEDS: readonly LeaseSeed[] = [
  {
    property: 'q7',
    unit: 1,
    tenant: company('Công ty TNHH Demo Phát Đạt', '0283 812 3456'),
    status: 'active',
    terms: terms('2025-01-01', '2027-12-31', 15_000_000, 3, '2026-12-31'),
    depositVnd: 30_000_000,
    taxPayer: 'tenant_withholds',
  },
  {
    property: 'thu-duc',
    unit: 1,
    tenant: person('Phạm Thị Lan Demo', '0912 345 678'),
    status: 'active',
    terms: terms('2025-11-01', '2026-11-01', 9_000_000, 1, '2026-10-31'),
    depositVnd: 18_000_000,
    taxPayer: 'owner',
  },
  room(1, '2025-03-25', 2_500_000, person('Nguyễn Văn An Demo', '0901 111 001')),
  room(2, '2025-06-25', 2_500_000, person('Trần Thị Bình Demo', '0901 111 002')),
  room(3, '2025-09-25', 2_500_000, person('Lê Văn Cường Demo', '0901 111 003')),
  room(4, '2026-01-25', 2_500_000, person('Võ Thị Dung Demo', '0901 111 004')),
  room(5, '2026-02-25', 2_800_000, person('Hoàng Văn Em Demo', '0901 111 005'), '2026-09-24'),
  room(6, '2026-05-25', 2_800_000, person('Đặng Thị Giang Demo', '0901 111 006')),
  {
    property: 'di-an',
    unit: 7,
    tenant: person('Bùi Văn Hùng Demo', '0901 111 007'),
    status: 'ended',
    terms: terms('2025-09-16', '2026-09-15', 2_800_000, 1, '2026-09-15', true),
    depositVnd: 2_800_000,
    taxPayer: 'owner',
  },
  {
    property: 'q1',
    unit: 1,
    tenant: company('Hộ kinh doanh Demo Bến Thành', '0909 222 333'),
    status: 'active',
    terms: terms('2026-03-01', '2029-02-28', 30_000_000, 12, '2027-02-28'),
    depositVnd: 60_000_000,
    taxPayer: 'owner',
  },
  {
    property: 'bien-hoa',
    unit: 1,
    tenant: company('Công ty Demo Kho Vận Đồng Nai', '0251 382 4567'),
    status: 'ended',
    terms: terms('2025-07-30', '2026-07-29', 12_000_000, 3, '2026-07-29'),
    depositVnd: 24_000_000,
    taxPayer: 'owner',
  },
];

/** SPEC §9.3: Dĩ An's September readings were all entered on 2026-10-03, so its October drafts issued that day. */
const READINGS: Partial<Record<PropertySeedKey, CompletedReadings>> = {
  'di-an': { month: d('2026-09-01'), completeOn: d('2026-10-03') },
};

const MEMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const leaseKey = (household: HouseholdSeed, seed: LeaseSeed) => `${household.key}:${seed.property}:${seed.unit}`;
const leaseId = (household: HouseholdSeed, seed: LeaseSeed) => seedId(`seed:lease:${leaseKey(household, seed)}`);
const tenantId = (household: HouseholdSeed, seed: LeaseSeed) => seedId(`seed:party:tenant-${leaseKey(household, seed)}`);
const invoiceId = (household: HouseholdSeed, seed: LeaseSeed, start: IsoDate) => seedId(`seed:invoice:${leaseKey(household, seed)}:${start}`);

/** Keyed by lease and period, never household, so every household gets the same codes and a reset reproduces them. */
function memoCode(seed: LeaseSeed, start: IsoDate): string {
  const rng = rngFor(`invoice-memo:${seed.property}:${seed.unit}:${start}`);
  return Array.from({ length: 8 }, () => MEMO_ALPHABET[rng.intInclusive(0, MEMO_ALPHABET.length - 1)]).join('');
}

type SeededInvoice = { readonly seed: LeaseSeed; readonly invoice: PlannedInvoice; readonly number: string };

/** SPEC §9.3 "today". Like every other seeded fact, the invoices are that day's state whatever `--as-of` says. */
const SPEC_TODAY = d('2026-10-07');

function seededInvoices({ properties }: SeedContext): SeededInvoice[] {
  const keys = new Set(properties.map((property) => property.key));
  const planned = LEASE_SEEDS.filter((seed) => seed.status === 'active' && keys.has(seed.property)).flatMap((seed) =>
    planInvoices(seed.terms, [], SPEC_TODAY, READINGS[seed.property] ?? null).map((invoice) => ({ seed, invoice })),
  );
  const counters = new Map<string, number>();
  return planned.map(({ seed, invoice }) => {
    const prefix = `${propertyCode(seed.property)}-${invoice.periodStart.slice(0, 4)}${invoice.periodStart.slice(5, 7)}`;
    const seq = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, seq);
    return { seed, invoice, number: `${prefix}-${String(seq).padStart(3, '0')}` };
  });
}

const leasesIn = ({ properties }: SeedContext) => {
  const keys = new Set(properties.map((property) => property.key));
  return LEASE_SEEDS.filter((seed) => keys.has(seed.property));
};

export const tenants = publicTable('parties', (ctx) =>
  leasesIn(ctx).map((seed) => ({
    id: tenantId(ctx.household, seed),
    household_id: householdId(ctx.household),
    kind: seed.tenant.kind,
    full_name: seed.tenant.fullName,
    phone: seed.tenant.phone.replaceAll(' ', ''),
    tags: ['tenant'],
    member_id: null,
  })),
);

export const leases = publicTable('leases', (ctx) =>
  leasesIn(ctx).map((seed) => {
    const unitSeed = UNIT_SEEDS[seed.property][seed.unit - 1];
    if (unitSeed === undefined) throw new Error(`No unit ${seed.unit} on ${seed.property}`);
    const { terms: lease } = seed;
    return {
      id: leaseId(ctx.household, seed),
      household_id: householdId(ctx.household),
      property_id: propertyId(ctx.household, seed.property),
      unit_id: unitId(ctx.household, seed.property, unitSeed, seed.unit - 1),
      tenant_party_id: tenantId(ctx.household, seed),
      start_date: lease.startDate,
      end_date: lease.endDate,
      rent_vnd: lease.rentVnd,
      billing_cycle_months: lease.billingCycleMonths,
      period_anchor: lease.periodAnchor,
      first_period_proration: lease.firstPeriodProration,
      due_offset_days: lease.dueOffsetDays,
      deposit_vnd: seed.depositVnd,
      escalation: JSON.stringify(lease.escalation),
      utilities_mode: lease.utilitiesMode,
      tax_payer: seed.taxPayer,
      notice_days: 30,
      paid_through_date: lease.paidThroughDate,
      status: seed.status,
    };
  }),
);

export const invoices = publicTable('invoices', (ctx) =>
  seededInvoices(ctx).map(({ seed, invoice, number }) => {
    const issued = invoice.issueOn <= SPEC_TODAY;
    return {
      id: invoiceId(ctx.household, seed, invoice.periodStart),
      household_id: householdId(ctx.household),
      lease_id: leaseId(ctx.household, seed),
      period_start: invoice.periodStart,
      period_end: invoice.periodEnd,
      due_date: invoice.dueDate,
      issue_on: invoice.issueOn,
      number,
      memo_code: memoCode(seed, invoice.periodStart),
      status: issued ? 'issued' : 'draft',
      issued_at: issued ? `${invoice.issueOn}T00:30:00+07:00` : null,
    };
  }),
);

export const invoiceLines = publicTable('invoice_lines', (ctx) =>
  seededInvoices(ctx).flatMap(({ seed, invoice }) =>
    invoice.lines.map((line, index) => ({
      id: seedId(`seed:invoice-line:${leaseKey(ctx.household, seed)}:${invoice.periodStart}:${index + 1}`),
      household_id: householdId(ctx.household),
      invoice_id: invoiceId(ctx.household, seed, invoice.periodStart),
      kind: line.kind,
      description: null,
      quantity: line.quantity,
      unit_price_vnd: line.unitPriceVnd,
      amount_vnd: line.amountVnd,
      sort_order: index,
    })),
  ),
);
