// Reads the seeded database of the ESTA_SLOT stack after `pnpm db:reset` (the `full` variant): `pnpm seed:facts`.
// The invoices and payments exist only once the database has billed, so these facts are read from its rows.
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { query } from '../../../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';

const workdir = slotWorkdir(join(import.meta.dirname, '../../../..'), parseSlot(process.env.ESTA_SLOT));
const HOUSEHOLDS = 11;
const SIX_MONTHS_ON = '2027-04-07';

type Row = Readonly<Record<string, string | number | null>>;

/** Every household's rows of `sql`, which selects `household` first; each household must read the same. */
function sameInEveryHousehold(sql: string): Row[] {
  const rows = query<Row & { household: string }>(workdir, sql);
  const byHousehold = new Map<string, Row[]>();
  for (const { household, ...row } of rows) byHousehold.set(household, [...(byHousehold.get(household) ?? []), row]);
  expect(byHousehold.size, `rows in ${byHousehold.size} of ${HOUSEHOLDS} households`).toBe(HOUSEHOLDS);
  const [first, ...rest] = byHousehold.values();
  for (const other of rest) expect(other).toEqual(first);
  return first ?? [];
}

const LEASES = `
  select h.name as household, p.code, u.label, l.status, l.start_date::text as start, l.end_date::text as end,
    l.rent_vnd as rent, l.billing_cycle_months as cycle
  from leases l join households h on h.id = l.household_id join properties p on p.id = l.property_id join units u on u.id = l.unit_id
  order by h.name, p.code, u.sort_order, u.label`;

const BALANCES = `
  with invoice_totals as (
    select i.id, i.household_id, i.lease_id, i.due_date, i.period_end, i.status, i.issue_on,
      (select sum(amount_vnd) from invoice_lines where invoice_id = i.id)::bigint as total,
      coalesce((select sum(amount_vnd) from payment_allocations where invoice_id = i.id), 0)::bigint as paid,
      (select count(*) from payment_allocations where invoice_id = i.id)::int as transfers
    from invoices i
  )
  select h.name as household, p.code, u.label, t.due_date::text as due, t.period_end::text as period_end, t.status,
    t.issue_on::text as issued_on, t.total, t.paid, t.transfers
  from invoice_totals t join households h on h.id = t.household_id join leases l on l.id = t.lease_id
    join properties p on p.id = l.property_id join units u on u.id = l.unit_id
  order by h.name, p.code, u.label, t.due_date`;

describe('SPEC §9.3 facts on the full seed', () => {
  let leases: Row[] = [];
  let invoices: Row[] = [];
  beforeAll(() => {
    leases = sameInEveryHousehold(LEASES);
    invoices = sameInEveryHousehold(BALANCES);
  });
  const lease = (code: string, label: string) => leases.find((row) => row.code === code && row.label === label);

  it('ends Thủ Đức on 2026-11-01, Phòng 7 on 2026-09-15 and Biên Hòa on 2026-07-29, and every other lease at least six months on', () => {
    expect(lease('THUDUC', 'Toàn bộ')).toMatchObject({ status: 'active', end: '2026-11-01', cycle: 1 });
    expect(lease('DIAN', 'Phòng 7')).toMatchObject({ status: 'ended', end: '2026-09-15' });
    expect(lease('BIENHOA', 'Toàn bộ')).toMatchObject({ status: 'ended', end: '2026-07-29' });
    const others = leases.filter((row) => !['THUDUC', 'BIENHOA'].includes(String(row.code)) && row.label !== 'Phòng 7');
    expect(others.map((row) => [row.code, row.label])).toEqual([
      ['DIAN', 'Phòng 1'], ['DIAN', 'Phòng 2'], ['DIAN', 'Phòng 3'], ['DIAN', 'Phòng 4'], ['DIAN', 'Phòng 5'], ['DIAN', 'Phòng 6'],
      ['Q1', 'Mặt bằng tầng trệt'], ['Q7', 'Toàn bộ'],
    ]);
    for (const row of others) expect(row.status === 'active' && String(row.end) >= SIX_MONTHS_ON, `${row.code} ${row.label} ends ${row.end}`).toBe(true);
  });

  it('bills Q7 quarterly from 2025-01-01, Dĩ An monthly from the 25th, and Quận 1 2.500.000 a month yearly from 2026-03-01', () => {
    expect(lease('Q7', 'Toàn bộ')).toMatchObject({ start: '2025-01-01', cycle: 3 });
    expect(lease('Q1', 'Mặt bằng tầng trệt')).toMatchObject({ start: '2026-03-01', rent: 2_500_000, cycle: 12 });
    for (const room of [1, 2, 3, 4, 5, 6]) expect(lease('DIAN', `Phòng ${room}`)).toMatchObject({ cycle: 1, start: expect.stringMatching(/-25$/) });
  });

  it("pays Q7 through 2026-12-31 and Thủ Đức through 2026-10-31", () => {
    const paidThrough = (code: string) =>
      invoices.filter((row) => row.code === code && row.paid === row.total).reduce((last, row) => (String(row.period_end) > last ? String(row.period_end) : last), '');
    expect(paidThrough('Q7')).toBe('2026-12-31');
    expect(paidThrough('THUDUC')).toBe('2026-10-31');
  });

  it("leaves Phòng 5's invoice due 2026-09-25 the one unpaid invoice due before 2026-10-07", () => {
    const pastDue = invoices.filter((row) => row.status === 'issued' && String(row.due) < '2026-10-07');
    expect(pastDue.filter((row) => row.paid !== row.total).map(({ code, label, due, paid }) => ({ code, label, due, paid }))).toEqual([
      { code: 'DIAN', label: 'Phòng 5', due: '2026-09-25', paid: 0 },
    ]);
  });

  it('issues the six Dĩ An invoices due 2026-10-25 on 2026-10-03, unpaid', () => {
    const october = invoices.filter((row) => row.code === 'DIAN' && row.due === '2026-10-25');
    expect(october.map(({ label, status, issued_on, paid }) => [label, status, issued_on, paid])).toEqual(
      [1, 2, 3, 4, 5, 6].map((room) => [`Phòng ${room}`, 'issued', '2026-10-03', 0]),
    );
  });

  it('holds twelve months of invoices and payments, October 2025 to September 2026, with one tenant paying in two transfers', () => {
    const months = ['2025-10', '2025-11', '2025-12', ...Array.from({ length: 9 }, (_, i) => `2026-0${i + 1}`)];
    const issuedMonths = new Set(invoices.filter((row) => row.status === 'issued').map((row) => String(row.due).slice(0, 7)));
    expect(months.filter((month) => !issuedMonths.has(month))).toEqual([]);
    const received = sameInEveryHousehold(`
      select h.name as household, to_char(p.received_on, 'YYYY-MM') as month, count(*)::int as payments
      from payments p join households h on h.id = p.household_id group by 1, 2 order by 1, 2`);
    expect(months.filter((month) => !received.some((row) => row.month === month))).toEqual([]);
    const split = invoices.filter((row) => row.status === 'issued' && row.paid === row.total && Number(row.transfers) === 2);
    expect(new Set(split.map((row) => row.label))).toEqual(new Set(['Phòng 2']));
    expect(split.length).toBeGreaterThanOrEqual(12);
  });

  it("keeps Phòng 7's deposit held and refunds Biên Hòa's on 2026-08-05", () => {
    const deposits = sameInEveryHousehold(`
      select h.name as household, p.code, u.label, l.status, l.deposit_vnd as deposit,
        sum(case when d.kind = 'received' then d.amount_vnd else -d.amount_vnd end)::bigint as held,
        string_agg(d.kind || ' ' || d.on_date::text, ', ' order by d.on_date, d.kind) as entries
      from deposit_entries d join leases l on l.id = d.lease_id join households h on h.id = d.household_id
        join properties p on p.id = l.property_id join units u on u.id = l.unit_id
      group by h.name, p.code, u.label, l.status, l.deposit_vnd order by 1, 2, 3`);
    const ended = deposits.filter((row) => row.status === 'ended');
    expect(ended.map(({ code, label, held, deposit }) => ({ code, label, holdsAll: held === deposit && Number(held) > 0, empty: Number(held) === 0 }))).toEqual([
      { code: 'BIENHOA', label: 'Toàn bộ', holdsAll: false, empty: true },
      { code: 'DIAN', label: 'Phòng 7', holdsAll: true, empty: false },
    ]);
    expect(ended[0]?.entries).toMatch(/refunded 2026-08-05$/);
  });

  it('leaves Phòng 8 unleased and free from 2026-08-01', () => {
    const rooms = sameInEveryHousehold(`
      select h.name as household, u.available_from::text as available_from, count(l.id)::int as leases
      from units u join households h on h.id = u.household_id join properties p on p.id = u.property_id
        left join leases l on l.unit_id = u.id
      where p.code = 'DIAN' and u.label = 'Phòng 8' group by 1, 2`);
    expect(rooms).toEqual([{ available_from: '2026-08-01', leases: 0 }]);
  });

  it('expires only the Q7 insurance before 2026-12-31, on 2026-10-30, and leaves no extraction waiting for review', () => {
    const expiring = sameInEveryHousehold(`
      select h.name as household, p.code, d.category, d.expires_on::text as expires_on
      from documents d join households h on h.id = d.household_id join properties p on p.id = d.property_id
      where d.deleted_at is null and d.expires_on < '2026-12-31' order by 1, 4`);
    expect(expiring).toEqual([{ code: 'Q7', category: 'insurance', expires_on: '2026-10-30' }]);
    const waiting = query<Row>(workdir, `select count(*)::int as n from document_extractions where status <> 'accepted'`);
    expect(waiting).toEqual([{ n: 0 }]);
  });

  it("reads September's meters on 2026-10-03 for all eight Dĩ An rooms", () => {
    const readings = sameInEveryHousehold(`
      select h.name as household, r.reading_month::text as month, r.read_on::text as read_on, count(*)::int as readings
      from meter_readings r join households h on h.id = r.household_id group by 1, 2, 3`);
    expect(readings).toEqual([{ month: '2026-09-01', read_on: '2026-10-03', readings: 16 }]);
  });

  it('values every property', () => {
    const valued = sameInEveryHousehold(`
      select h.name as household, p.code, count(v.id)::int as valuations
      from properties p join households h on h.id = p.household_id left join valuations v on v.property_id = p.id
      group by 1, 2 order by 1, 2`);
    expect(valued.map((row) => row.code)).toEqual(['BAOLOC', 'BIENHOA', 'DIAN', 'LONGAN', 'Q1', 'Q7', 'THUDUC']);
    expect(valued.every((row) => Number(row.valuations) >= 1)).toBe(true);
  });

  it("gives Mẹ Q7, Dĩ An, Quận 1 and Bảo Lộc, splits Thủ Đức and Biên Hòa 50/50, and gives Ryan Long An", () => {
    const shares = sameInEveryHousehold(`
      select h.name as household, p.code, string_agg(o.full_name || ' ' || s.share_bp, ', ' order by o.full_name) as owners
      from ownership_shares s join households h on h.id = s.household_id join properties p on p.id = s.property_id
        join parties o on o.id = s.party_id
      group by 1, 2 order by 1, 2`);
    const me = 'Nguyễn Thị Demo';
    const ryan = 'Trần Minh Demo';
    expect(Object.fromEntries(shares.map((row) => [row.code, row.owners]))).toEqual({
      BAOLOC: `${me} 10000`,
      BIENHOA: `${me} 5000, ${ryan} 5000`,
      DIAN: `${me} 10000`,
      LONGAN: `${ryan} 10000`,
      Q1: `${me} 10000`,
      Q7: `${me} 10000`,
      THUDUC: `${me} 5000, ${ryan} 5000`,
    });
  });

  it('records no other business revenue for either owner in 2026', () => {
    const inputs = sameInEveryHousehold(`
      select h.name as household, o.full_name as owner, t.year, t.other_business_revenue_vnd as other
      from owner_tax_inputs t join households h on h.id = t.household_id join parties o on o.id = t.party_id order by 1, 2`);
    expect(inputs).toEqual([
      { owner: 'Nguyễn Thị Demo', year: 2026, other: 0 },
      { owner: 'Trần Minh Demo', year: 2026, other: 0 },
    ]);
  });
});
