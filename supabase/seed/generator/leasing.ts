import type { Instant } from '../../../packages/core/src/index.ts';
import { isoDate, type IsoDate } from '../../../packages/core/src/date/iso-date.ts';
import type { BillingCycleMonths, PeriodAnchor } from '../../../packages/core/src/schedule/types.ts';
import { normalizePhone } from '../../../packages/core/src/phone/index.ts';
import { publicTable, type HouseholdSeed, type SeedContext } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import { quote } from './sql.ts';
import { METER_ENTRY, septemberReadingsSql } from './meters.ts';
import type { PropertySeedKey } from './properties.ts';
import { propertyId, unitId, UNIT_SEEDS } from './units.ts';

type Tenant = { readonly kind: 'individual' | 'organization'; readonly fullName: string; readonly phone: string };

type LeaseTerms = {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly rentVnd: number;
  readonly billingCycleMonths: BillingCycleMonths;
  readonly periodAnchor: PeriodAnchor;
  readonly utilitiesMode: 'tenant_direct' | 'metered_by_owner';
  /** Rent collected before Esta: through the day before the first period due on or after 2025-10-01, as activation records it. */
  readonly paidThroughDate: IsoDate | null;
};

type LeaseSeed = {
  readonly property: PropertySeedKey;
  /** 1-based position in UNIT_SEEDS[property]. */
  readonly unit: number;
  readonly tenant: Tenant;
  readonly terms: LeaseTerms;
  readonly depositVnd: number;
  readonly taxPayer: 'owner' | 'tenant_withholds';
};

const d = isoDate;

const terms = (startDate: string, endDate: string, rentVnd: number, cycle: 1 | 3 | 12, paidThrough: string | null, room = false): LeaseTerms => ({
  startDate: d(startDate),
  endDate: d(endDate),
  rentVnd,
  billingCycleMonths: cycle,
  periodAnchor: room ? 'lease_start' : 'calendar_month',
  utilitiesMode: room ? 'metered_by_owner' : 'tenant_direct',
  paidThroughDate: paidThrough === null ? null : d(paidThrough),
});

const person = (fullName: string, phone: string): Tenant => ({ kind: 'individual', fullName, phone });
const company = (fullName: string, phone: string): Tenant => ({ kind: 'organization', fullName, phone });

/** Dĩ An rooms bill from the 25th. */
const room = (n: number, start: string, rent: number, paidThrough: string | null, tenant: Tenant): LeaseSeed => ({
  property: 'di-an',
  unit: n,
  tenant,
  terms: terms(start, '2027-06-24', rent, 1, paidThrough, true),
  depositVnd: rent,
  taxPayer: 'owner',
});

/** SPEC §9.3, as of 2026-10-07. Payments say what was collected: `q7` through 2026-12-31, `thu-duc` through 2026-10-31. */
export const LEASE_SEEDS: readonly LeaseSeed[] = [
  {
    property: 'q7',
    unit: 1,
    tenant: company('Công ty TNHH Demo Phát Đạt', '0283 812 3456'),
    terms: terms('2025-01-01', '2027-12-31', 15_000_000, 3, '2025-09-30'),
    depositVnd: 30_000_000,
    taxPayer: 'tenant_withholds',
  },
  {
    property: 'thu-duc',
    unit: 1,
    tenant: person('Phạm Thị Lan Demo', '0912 345 678'),
    terms: terms('2025-11-01', '2026-11-01', 9_000_000, 1, null),
    depositVnd: 18_000_000,
    taxPayer: 'owner',
  },
  room(1, '2025-03-25', 2_500_000, '2025-10-24', person('Nguyễn Văn An Demo', '0901 111 001')),
  room(2, '2025-06-25', 2_500_000, '2025-10-24', person('Trần Thị Bình Demo', '0901 111 002')),
  room(3, '2025-09-25', 2_500_000, '2025-10-24', person('Lê Văn Cường Demo', '0901 111 003')),
  room(4, '2026-01-25', 2_500_000, null, person('Võ Thị Dung Demo', '0901 111 004')),
  room(5, '2026-02-25', 2_800_000, null, person('Hoàng Văn Em Demo', '0901 111 005')),
  room(6, '2026-05-25', 2_800_000, null, person('Đặng Thị Giang Demo', '0901 111 006')),
  {
    property: 'di-an',
    unit: 7,
    tenant: person('Bùi Văn Hùng Demo', '0901 111 007'),
    terms: terms('2025-09-16', '2026-09-15', 2_800_000, 1, '2025-10-15', true),
    depositVnd: 2_800_000,
    taxPayer: 'owner',
  },
  {
    property: 'q1',
    unit: 1,
    tenant: company('Hộ kinh doanh Demo Bến Thành', '0909 222 333'),
    terms: terms('2026-03-01', '2029-02-28', 2_500_000, 12, null),
    depositVnd: 60_000_000,
    taxPayer: 'owner',
  },
  {
    property: 'bien-hoa',
    unit: 1,
    tenant: company('Công ty Demo Kho Vận Đồng Nai', '0251 382 4567'),
    terms: terms('2025-07-30', '2026-07-29', 12_000_000, 3, '2025-09-30'),
    depositVnd: 24_000_000,
    taxPayer: 'owner',
  },
];

type AmendmentSeed = {
  readonly property: PropertySeedKey;
  readonly unit: number;
  readonly effectivePeriodStart: IsoDate;
  readonly rentVnd: number;
  readonly reason: string;
};

/** One rent change after SPEC_TODAY, past every billed period, so lease detail shows an amendment without moving any invoice. */
export const AMENDMENT_SEEDS: readonly AmendmentSeed[] = [
  { property: 'q7', unit: 1, effectivePeriodStart: d('2027-01-01'), rentVnd: 16_000_000, reason: 'Phụ lục Demo: tăng giá từ năm 2027' },
];

const leaseKey = (household: HouseholdSeed, seed: { readonly property: PropertySeedKey; readonly unit: number }) => `${household.key}:${seed.property}:${seed.unit}`;
const leaseId = (household: HouseholdSeed, seed: { readonly property: PropertySeedKey; readonly unit: number }) => seedId(`seed:lease:${leaseKey(household, seed)}`);
export const seedLeaseId = leaseId;
const INVOICE_KEY = 'seed:invoice:';
export const seedInvoiceId = (household: HouseholdSeed, seed: { readonly property: PropertySeedKey; readonly unit: number }, periodStart: string) =>
  seedId(`${INVOICE_KEY}${leaseKey(household, seed)}:${periodStart}`);
const tenantId = (household: HouseholdSeed, seed: LeaseSeed) => seedId(`seed:party:tenant-${leaseKey(household, seed)}`);

const leasesIn = ({ properties }: Pick<SeedContext, 'properties'>) => {
  const keys = new Set(properties.map((property) => property.key));
  return LEASE_SEEDS.filter((seed) => keys.has(seed.property));
};

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

/** Every lease starts active; the nightly job ends Phòng 7 and Kho Biên Hòa when their end dates pass, as it would have. */
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
      first_period_proration: 'by_days',
      due_offset_days: 0,
      deposit_vnd: seed.depositVnd,
      escalation: JSON.stringify({ kind: 'none' }),
      utilities_mode: lease.utilitiesMode,
      tax_payer: seed.taxPayer,
      notice_days: 30,
      paid_through_date: lease.paidThroughDate,
      status: 'active',
    };
  }),
);

export const leaseAmendments = publicTable('lease_amendments', (ctx) => {
  const keys = new Set(leasesIn(ctx).map((seed) => `${seed.property}:${seed.unit}`));
  return AMENDMENT_SEEDS.filter((amendment) => keys.has(`${amendment.property}:${amendment.unit}`)).map((amendment) => ({
    id: seedId(`seed:lease-amendment:${leaseKey(ctx.household, amendment)}:${amendment.effectivePeriodStart}`),
    household_id: householdId(ctx.household),
    lease_id: leaseId(ctx.household, amendment),
    effective_period_start: amendment.effectivePeriodStart,
    changes: JSON.stringify({ rent_vnd: amendment.rentVnd }),
    reason: amendment.reason,
  }));
});

/** SPEC §9.3: every ended lease but Phòng 7's gave its deposit back; Kho Biên Hòa's was refunded on 2026-08-05. */
const DEPOSIT_REFUNDS: readonly { readonly property: PropertySeedKey; readonly unit: number; readonly onDate: IsoDate }[] = [
  { property: 'bien-hoa', unit: 1, onDate: d('2026-08-05') },
];

/** Each lease with a deposit received it on its first day, so Phòng 7's ended lease still holds all of it. */
export const depositEntries = publicTable('deposit_entries', (ctx) =>
  leasesIn(ctx)
    .filter((seed) => seed.depositVnd > 0)
    .flatMap((seed) => {
      const key = leaseKey(ctx.household, seed);
      const entry = (kind: 'received' | 'refunded', onDate: IsoDate) => ({
        id: seedId(`seed:deposit-entry:${key}:${kind}`),
        household_id: householdId(ctx.household),
        lease_id: leaseId(ctx.household, seed),
        kind,
        amount_vnd: seed.depositVnd,
        on_date: onDate,
        note: null,
        payment_id: null,
      });
      const refund = DEPOSIT_REFUNDS.find((target) => target.property === seed.property && target.unit === seed.unit);
      return [entry('received', seed.terms.startDate), ...(refund === undefined ? [] : [entry('refunded', refund.onDate)])];
    }),
);

/** SPEC §9.3: twelve months of invoices, so the nightly job runs from this night. */
const HISTORY_FROM = '2025-10-01';

/** SPEC §9.3 "today". Like every other seeded fact, the invoices are that day's state whatever `--as-of` says. */
export const SPEC_TODAY = '2026-10-07';

/** SPEC §9.3: the one issued invoice due before SPEC_TODAY that nobody paid. */
export const UNPAID = { property: 'di-an', unit: 5, periodStart: '2026-09-25', dueDate: '2026-09-25' } as const;

/** SPEC §9.3: this tenant pays every month in two partial transfers that sum to the full amount. */
const TWO_TRANSFERS = { property: 'di-an', unit: 2 } as const;


/**
 * The invoices and payments of every household, written after the tables. The database bills: `end_expired_leases` and
 * `run_invoicing` run for each night from HISTORY_FROM to SPEC_TODAY, as the daily cron does. Dĩ An's September readings
 * land on 2026-10-03 before that night's run (SPEC §9.3), which finds them complete and issues the October drafts. Seed-only triggers give each invoice and line its seed id, and each invoice a memo code
 * and, once issued, a share token drawn from its seed key, so two resets write the same rows. Then every issued invoice due before SPEC_TODAY is paid in full except
 * UNPAID: rooms from two days early to a week late, three in ten in cash, companies by transfer up to six days early.
 * Draws come from md5 of a scope string, the SQL side of `rngFor`. `supabase db reset` prepares every seed statement
 * before it runs the first, so each statement that reads a table this file creates sits inside the DO block.
 */
export function billingSql(households: readonly HouseholdSeed[], ctx: Pick<SeedContext, 'properties'>, stamp: Instant): string {
  const rows = households.flatMap((household) =>
    leasesIn(ctx).map((seed) => `(${quote(leaseId(household, seed))}, ${quote(leaseKey(household, seed))}, ${quote(seed.property)}, ${seed.unit})`),
  );
  if (rows.length === 0) return '';
  const readings = septemberReadingsSql(households, ctx, stamp);
  return `create temporary table seed_lease (lease_id uuid primary key, key text not null, property text not null, unit integer not null);

create function pg_temp.seed_draw(p_scope text, p_n integer) returns double precision language sql immutable
as $$ select ('x' || substr(md5(p_scope || '#' || p_n), 1, 8))::bit(32)::bigint / 4294967296.0 $$;

create function pg_temp.seed_invoice() returns trigger language plpgsql as $$
declare
  v_lease record;
begin
  select k.key, k.property, k.unit into v_lease from pg_temp.seed_lease k where k.lease_id = new.lease_id;
  new.id := extensions.uuid_generate_v5(extensions.uuid_ns_url(), '${INVOICE_KEY}' || v_lease.key || ':' || new.period_start);
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(pg_temp.seed_draw('invoice-memo:' || v_lease.property || ':' || v_lease.unit || ':' || new.period_start, i) * 31)::integer + 1, 1), '' order by i)
  into new.memo_code from generate_series(1, 8) i;
  return new;
end;
$$;
create trigger seed_invoice before insert on public.invoices for each row execute function pg_temp.seed_invoice();

-- Sorts before share_invoice, which keeps a token already set.
create function pg_temp.seed_invoice_share() returns trigger language plpgsql as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    select translate(rtrim(encode(decode(md5('seed:invoice-share:' || k.key || ':' || new.period_start), 'hex'), 'base64'), '='), '+/', '-_')
    into new.share_token from pg_temp.seed_lease k where k.lease_id = new.lease_id;
  end if;
  return new;
end;
$$;
create trigger seed_invoice_share before insert or update on public.invoices for each row execute function pg_temp.seed_invoice_share();

create function pg_temp.seed_invoice_line() returns trigger language plpgsql as $$
begin
  select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:invoice-line:' || k.key || ':' || i.period_start || ':1')
  into new.id from public.invoices i join pg_temp.seed_lease k on k.lease_id = i.lease_id where i.id = new.invoice_id;
  return new;
end;
$$;
create trigger seed_invoice_line before insert on public.invoice_lines for each row execute function pg_temp.seed_invoice_line();

do $$
declare
  v_night date;
  v_household uuid;
begin
  insert into pg_temp.seed_lease values
    ${rows.join(',\n    ')};

  for v_night in select n::date from generate_series(date '${HISTORY_FROM}', date '${SPEC_TODAY}', interval '1 day') n loop
    ${readings === '' ? '' : `if v_night = date '${METER_ENTRY.readOn}' then
      ${readings}
    end if;
    `}perform public.end_expired_leases(v_night);
    for v_household in select h.id from public.households h order by h.id loop
      perform public.run_invoicing(v_household, v_night, (v_night + time '00:30') at time zone 'Asia/Ho_Chi_Minh');
    end loop;
  end loop;
  drop trigger seed_invoice on public.invoices;
  drop trigger seed_invoice_share on public.invoices;
  drop trigger seed_invoice_line on public.invoice_lines;

  create temporary table seed_payment as
  select
    k.key || ':' || i.period_start as key, i.id as invoice_id, i.household_id, l.tenant_party_id, i.memo_code, total.vnd as total_vnd,
    least(i.due_date + case when p.kind = 'organization' then -6 + floor(pg_temp.seed_draw(scope, 1) * 8)::integer else -2 + floor(pg_temp.seed_draw(scope, 1) * 10)::integer end,
          date '${SPEC_TODAY}' - 1) as received_on,
    case when p.kind = 'individual' and pg_temp.seed_draw(scope, 2) < 0.3 then 'cash' else 'bank_transfer' end as method,
    (k.property, k.unit) = ('${TWO_TRANSFERS.property}', ${TWO_TRANSFERS.unit}) as split,
    3 + floor(pg_temp.seed_draw(scope, 3) * 7)::integer as second_after
  from public.invoices i
  join pg_temp.seed_lease k on k.lease_id = i.lease_id
  join public.leases l on l.id = i.lease_id
  join public.parties p on p.id = l.tenant_party_id
  cross join lateral (select sum(line.amount_vnd)::bigint as vnd from public.invoice_lines line where line.invoice_id = i.id) total
  cross join lateral (select 'payment:' || k.property || ':' || k.unit || ':' || i.period_start as scope) draw
  where i.status = 'issued' and i.due_date < date '${SPEC_TODAY}'
    and not ((k.property, k.unit, i.due_date) = ('${UNPAID.property}', ${UNPAID.unit}, date '${UNPAID.dueDate}'));

  create temporary table seed_transfer as
  select key || ':1' as key, invoice_id, household_id, tenant_party_id, memo_code, received_on,
    case when split then 'bank_transfer' else method end as method,
    case when split then round(total_vnd * 0.6 / 100000) * 100000 else total_vnd end::bigint as amount_vnd
  from pg_temp.seed_payment
  union all
  select key || ':2', invoice_id, household_id, tenant_party_id, memo_code, least(received_on + second_after, date '${SPEC_TODAY}' - 1), 'bank_transfer',
    (total_vnd - round(total_vnd * 0.6 / 100000) * 100000)::bigint
  from pg_temp.seed_payment where split;

  insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method, memo, source, created_at, updated_at)
  select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:payment:' || key), household_id, tenant_party_id, amount_vnd, received_on, method,
    case when method = 'bank_transfer' then 'ESTA ' || memo_code end, 'manual', '${stamp}', '${stamp}'
  from pg_temp.seed_transfer;
  insert into public.payment_allocations (id, household_id, payment_id, invoice_id, amount_vnd, created_at, updated_at)
  select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:payment-allocation:' || key), household_id,
    extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:payment:' || key), invoice_id, amount_vnd, '${stamp}', '${stamp}'
  from pg_temp.seed_transfer;
end;
$$;

drop table pg_temp.seed_lease, pg_temp.seed_payment, pg_temp.seed_transfer;
drop function pg_temp.seed_invoice(), pg_temp.seed_invoice_share(), pg_temp.seed_invoice_line(), pg_temp.seed_draw(text, integer);
`;
}
