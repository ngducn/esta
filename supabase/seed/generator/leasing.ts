import { isoDate, type IsoDate } from '../../../packages/core/src/date/iso-date.ts';
import { planInvoices, type CompletedReadings, type InvoicingLease, type PlannedInvoice } from '../../../packages/core/src/lease/invoicing.ts';
import { vnd } from '../../../packages/core/src/money/vnd.ts';
import { addDays, addMonths, generateSchedule, type Amendment } from '../../../packages/core/src/schedule/index.ts';
import { normalizePhone } from '../../../packages/core/src/phone/index.ts';
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

/** SPEC §9.3: twelve months of invoices, so Esta bills from the first period due on or after this day. */
const HISTORY_FROM = d('2025-10-01');

/** Rent before Esta counts as paid through the day before its first billed period, as activation would have recorded. */
function historyPaidThrough(lease: InvoicingLease): IsoDate | null {
  const first = generateSchedule(lease, [], addMonths(HISTORY_FROM, 12)).find((period) => addDays(period.start, lease.dueOffsetDays) >= HISTORY_FROM);
  return first === undefined || first.start === lease.startDate ? null : addDays(first.start, -1);
}

const terms = (startDate: string, endDate: string, rentVnd: number, cycle: 1 | 3 | 12, room = false): InvoicingLease => {
  const lease: InvoicingLease = {
    startDate: d(startDate),
    endDate: d(endDate),
    rentVnd: vnd(rentVnd),
    billingCycleMonths: cycle,
    periodAnchor: room ? 'lease_start' : 'calendar_month',
    firstPeriodProration: 'by_days',
    dueOffsetDays: 0,
    escalation: { kind: 'none' },
    paidThroughDate: null,
    utilitiesMode: room ? 'metered_by_owner' : 'tenant_direct',
  };
  return { ...lease, paidThroughDate: historyPaidThrough(lease) };
};

const person = (fullName: string, phone: string): Tenant => ({ kind: 'individual', fullName, phone });
const company = (fullName: string, phone: string): Tenant => ({ kind: 'organization', fullName, phone });

/** Dĩ An rooms bill from the 25th. */
const room = (n: number, start: string, rent: number, tenant: Tenant): LeaseSeed => ({
  property: 'di-an',
  unit: n,
  tenant,
  status: 'active',
  terms: terms(start, '2027-06-24', rent, 1, true),
  depositVnd: rent,
  taxPayer: 'owner',
});

/** SPEC §9.3, as of 2026-10-07. Payments say what was collected: `q7` through 2026-12-31, `thu-duc` through 2026-10-31. */
export const LEASE_SEEDS: readonly LeaseSeed[] = [
  {
    property: 'q7',
    unit: 1,
    tenant: company('Công ty TNHH Demo Phát Đạt', '0283 812 3456'),
    status: 'active',
    terms: terms('2025-01-01', '2027-12-31', 15_000_000, 3),
    depositVnd: 30_000_000,
    taxPayer: 'tenant_withholds',
  },
  {
    property: 'thu-duc',
    unit: 1,
    tenant: person('Phạm Thị Lan Demo', '0912 345 678'),
    status: 'active',
    terms: terms('2025-11-01', '2026-11-01', 9_000_000, 1),
    depositVnd: 18_000_000,
    taxPayer: 'owner',
  },
  room(1, '2025-03-25', 2_500_000, person('Nguyễn Văn An Demo', '0901 111 001')),
  room(2, '2025-06-25', 2_500_000, person('Trần Thị Bình Demo', '0901 111 002')),
  room(3, '2025-09-25', 2_500_000, person('Lê Văn Cường Demo', '0901 111 003')),
  room(4, '2026-01-25', 2_500_000, person('Võ Thị Dung Demo', '0901 111 004')),
  room(5, '2026-02-25', 2_800_000, person('Hoàng Văn Em Demo', '0901 111 005')),
  room(6, '2026-05-25', 2_800_000, person('Đặng Thị Giang Demo', '0901 111 006')),
  {
    property: 'di-an',
    unit: 7,
    tenant: person('Bùi Văn Hùng Demo', '0901 111 007'),
    status: 'ended',
    terms: terms('2025-09-16', '2026-09-15', 2_800_000, 1, true),
    depositVnd: 2_800_000,
    taxPayer: 'owner',
  },
  {
    property: 'q1',
    unit: 1,
    tenant: company('Hộ kinh doanh Demo Bến Thành', '0909 222 333'),
    status: 'active',
    terms: terms('2026-03-01', '2029-02-28', 30_000_000, 12),
    depositVnd: 60_000_000,
    taxPayer: 'owner',
  },
  {
    property: 'bien-hoa',
    unit: 1,
    tenant: company('Công ty Demo Kho Vận Đồng Nai', '0251 382 4567'),
    status: 'ended',
    terms: terms('2025-07-30', '2026-07-29', 12_000_000, 3),
    depositVnd: 24_000_000,
    taxPayer: 'owner',
  },
];

type AmendmentSeed = Amendment & { readonly property: PropertySeedKey; readonly unit: number; readonly reason: string };

/** One rent change after SPEC_TODAY, past every billed period, so lease detail shows an amendment without moving any invoice. */
export const AMENDMENT_SEEDS: readonly AmendmentSeed[] = [
  { property: 'q7', unit: 1, effectivePeriodStart: d('2027-01-01'), changes: { rentVnd: vnd(16_000_000) }, reason: 'Phụ lục Demo: tăng giá từ năm 2027' },
];

const amendmentsOf = (seed: LeaseSeed) => AMENDMENT_SEEDS.filter((amendment) => amendment.property === seed.property && amendment.unit === seed.unit);

/** SPEC §9.3: Dĩ An's September readings were all entered on 2026-10-03, so its October drafts issued that day. */
const READINGS: Partial<Record<PropertySeedKey, CompletedReadings>> = {
  'di-an': { month: d('2026-09-01'), completeOn: d('2026-10-03') },
};

const MEMO_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const leaseKey = (household: HouseholdSeed, seed: LeaseSeed) => `${household.key}:${seed.property}:${seed.unit}`;
const leaseId = (household: HouseholdSeed, seed: { readonly property: PropertySeedKey; readonly unit: number }) =>
  seedId(`seed:lease:${household.key}:${seed.property}:${seed.unit}`);
export const seedLeaseId = leaseId;
const tenantId = (household: HouseholdSeed, seed: LeaseSeed) => seedId(`seed:party:tenant-${leaseKey(household, seed)}`);
const invoiceId = (household: HouseholdSeed, seed: LeaseSeed, start: IsoDate) => seedId(`seed:invoice:${leaseKey(household, seed)}:${start}`);

/** Keyed by lease and period, never household, so every household gets the same codes and a reset reproduces them. */
function memoCode(seed: LeaseSeed, start: IsoDate): string {
  const rng = rngFor(`invoice-memo:${seed.property}:${seed.unit}:${start}`);
  return Array.from({ length: 8 }, () => MEMO_ALPHABET[rng.intInclusive(0, MEMO_ALPHABET.length - 1)]).join('');
}

const leasesIn = ({ properties }: SeedContext) => {
  const keys = new Set(properties.map((property) => property.key));
  return LEASE_SEEDS.filter((seed) => keys.has(seed.property));
};

type SeededInvoice = { readonly seed: LeaseSeed; readonly invoice: PlannedInvoice; readonly number: string };

/** SPEC §9.3 "today". Like every other seeded fact, the invoices are that day's state whatever `--as-of` says. */
const SPEC_TODAY = d('2026-10-07');

/**
 * What the daily cron would have written from HISTORY_FROM to SPEC_TODAY: each month's plan, then that day's plan with
 * the readings, which can issue a metered period early.
 */
function leaseInvoices(seed: LeaseSeed): PlannedInvoice[] {
  const byStart = new Map<IsoDate, PlannedInvoice>();
  for (let asOf = HISTORY_FROM; asOf < SPEC_TODAY; asOf = addMonths(asOf, 1)) {
    for (const invoice of planInvoices(seed.terms, amendmentsOf(seed), asOf)) byStart.set(invoice.periodStart, invoice);
  }
  for (const invoice of planInvoices(seed.terms, amendmentsOf(seed), SPEC_TODAY, READINGS[seed.property] ?? null)) byStart.set(invoice.periodStart, invoice);
  return [...byStart.values()].toSorted((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function seededInvoices(ctx: SeedContext): SeededInvoice[] {
  const planned = leasesIn(ctx)
    .flatMap((seed) => leaseInvoices(seed).map((invoice) => ({ seed, invoice })))
    .toSorted((a, b) => a.invoice.periodStart.localeCompare(b.invoice.periodStart));
  const counters = new Map<string, number>();
  return planned.map(({ seed, invoice }) => {
    const prefix = `${propertyCode(seed.property)}-${invoice.periodStart.slice(0, 4)}${invoice.periodStart.slice(5, 7)}`;
    const seq = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, seq);
    return { seed, invoice, number: `${prefix}-${String(seq).padStart(3, '0')}` };
  });
}

/** The form `createTenant` stores, so seeded and quick-added tenants read the same. */
function storedPhone(text: string): string {
  const phone = normalizePhone(text);
  if (!phone.ok) throw new Error(`Seed phone ${text} is ${phone.reason}`);
  return phone.value;
}

export const tenants = publicTable('parties', (ctx) =>
  leasesIn(ctx).map((seed) => ({
    id: tenantId(ctx.household, seed),
    household_id: householdId(ctx.household),
    kind: seed.tenant.kind,
    full_name: seed.tenant.fullName,
    phone: storedPhone(seed.tenant.phone),
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

export const leaseAmendments = publicTable('lease_amendments', (ctx) => {
  const keys = new Set(leasesIn(ctx).map((seed) => `${seed.property}:${seed.unit}`));
  return AMENDMENT_SEEDS.filter((amendment) => keys.has(`${amendment.property}:${amendment.unit}`)).map((amendment) => ({
    id: seedId(`seed:lease-amendment:${ctx.household.key}:${amendment.property}:${amendment.unit}:${amendment.effectivePeriodStart}`),
    household_id: householdId(ctx.household),
    lease_id: leaseId(ctx.household, amendment),
    effective_period_start: amendment.effectivePeriodStart,
    changes: JSON.stringify({
      ...(amendment.changes.rentVnd === undefined ? {} : { rent_vnd: amendment.changes.rentVnd }),
      ...(amendment.changes.billingCycleMonths === undefined ? {} : { billing_cycle_months: amendment.changes.billingCycleMonths }),
    }),
    reason: amendment.reason,
  }));
});

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

/** SPEC §9.3: the one issued invoice due before SPEC_TODAY that nobody paid. */
const UNPAID = { property: 'di-an', unit: 5, dueDate: d('2026-09-25') } as const;

/** SPEC §9.3: this tenant pays every month in two partial transfers that sum to the full amount. */
const TWO_TRANSFERS = { property: 'di-an', unit: 2 } as const;

type SeededPayment = {
  readonly key: string;
  readonly invoice: SeededInvoice;
  readonly amountVnd: number;
  readonly receivedOn: IsoDate;
  readonly method: 'cash' | 'bank_transfer';
};

const isSeed = (seed: LeaseSeed, target: { readonly property: PropertySeedKey; readonly unit: number }) =>
  seed.property === target.property && seed.unit === target.unit;

const latest = (date: IsoDate) => (date < SPEC_TODAY ? date : addDays(SPEC_TODAY, -1));

/**
 * Every issued invoice due before SPEC_TODAY is paid in full except UNPAID. Rooms pay from two days early to a week late,
 * some in cash; companies transfer up to a week early.
 */
function seededPayments(ctx: SeedContext): SeededPayment[] {
  return seededInvoices(ctx)
    .filter(({ seed, invoice }) => invoice.issueOn <= SPEC_TODAY && invoice.dueDate < SPEC_TODAY && !(isSeed(seed, UNPAID) && invoice.dueDate === UNPAID.dueDate))
    .flatMap((seeded): SeededPayment[] => {
      const { seed, invoice } = seeded;
      const rng = rngFor(`payment:${seed.property}:${seed.unit}:${invoice.periodStart}`);
      const key = `${leaseKey(ctx.household, seed)}:${invoice.periodStart}`;
      const totalVnd = invoice.lines.reduce((sum, line) => sum + line.amountVnd, 0);
      const company = seed.tenant.kind === 'organization';
      const receivedOn = latest(addDays(invoice.dueDate, company ? rng.intInclusive(-6, 1) : rng.intInclusive(-2, 7)));
      const method = !company && rng.next() < 0.3 ? 'cash' : 'bank_transfer';
      if (!isSeed(seed, TWO_TRANSFERS)) return [{ key: `${key}:1`, invoice: seeded, amountVnd: totalVnd, receivedOn, method }];
      const first = Math.round((totalVnd * 0.6) / 100_000) * 100_000;
      return [
        { key: `${key}:1`, invoice: seeded, amountVnd: first, receivedOn, method: 'bank_transfer' },
        { key: `${key}:2`, invoice: seeded, amountVnd: totalVnd - first, receivedOn: latest(addDays(receivedOn, rng.intInclusive(3, 9))), method: 'bank_transfer' },
      ];
    });
}

export const payments = publicTable('payments', (ctx) =>
  seededPayments(ctx).map(({ key, invoice: { seed, invoice }, amountVnd, receivedOn, method }) => ({
    id: seedId(`seed:payment:${key}`),
    household_id: householdId(ctx.household),
    payer_party_id: tenantId(ctx.household, seed),
    amount_vnd: amountVnd,
    received_on: receivedOn,
    method,
    memo: method === 'bank_transfer' ? `ESTA ${memoCode(seed, invoice.periodStart)}` : null,
    source: 'manual',
  })),
);

export const paymentAllocations = publicTable('payment_allocations', (ctx) =>
  seededPayments(ctx).map(({ key, invoice: { seed, invoice }, amountVnd }) => ({
    id: seedId(`seed:payment-allocation:${key}`),
    household_id: householdId(ctx.household),
    payment_id: seedId(`seed:payment:${key}`),
    invoice_id: invoiceId(ctx.household, seed, invoice.periodStart),
    amount_vnd: amountVnd,
  })),
);
