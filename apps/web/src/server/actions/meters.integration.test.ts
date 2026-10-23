import { beforeAll, describe, expect, it } from 'vitest';
import { integrationLane } from '@/test/lanes';
import { memberClient } from '@/test/member-client';
import { service } from '@/test/stack';

// `pnpm test:integration` (scripts/web-integration.ts) sets the slot's database clock to 2026-10-07, so the month
// before it, September, is the one being read. The file bills its own Demo rooming house in its lane, with August's
// readings already in: Phòng A and Phòng B bill from the 25th, their September bills issued and October's drafted;
// Phòng C bills by calendar month, its October bill issued and November's drafted.
const { household: HOUSEHOLD, me } = integrationLane(import.meta.url);
const { client, signIn } = memberClient(me, HOUSEHOLD);

const { saveReadings } = await import('./meters');

const run = Math.floor(Math.random() * 1e6)
  .toString()
  .padStart(6, '0');
const id = () => crypto.randomUUID();
const property = id();
const tenant = id();
const rooms = { a: id(), b: id(), c: id() };
const leases = { a: id(), b: id(), c: id() };
const meters = { aPower: id(), aWater: id(), bPower: id(), bWater: id(), cPower: id() };
const AUGUST = { aPower: 1000, aWater: 40, bPower: 2000, bWater: 70, cPower: 500 } as const;

const post = (table: string, rows: unknown) => service(`/rest/v1/${table}`, { method: 'POST', body: JSON.stringify(rows) });
const flat = (price: number) => ({ kind: 'flat', unit_price_vnd: price });

async function seedDemoRoomingHouse() {
  await post('properties', { id: property, household_id: HOUSEHOLD, nickname: `Demo P3-14 ${run}`, code: `MT${run}`, kind: 'rooming_house', use_mode: 'rental' });
  await post('units', [
    { id: rooms.a, household_id: HOUSEHOLD, property_id: property, label: 'Phòng A', kind: 'room' },
    { id: rooms.b, household_id: HOUSEHOLD, property_id: property, label: 'Phòng B', kind: 'room' },
    { id: rooms.c, household_id: HOUSEHOLD, property_id: property, label: 'Phòng C', kind: 'room' },
  ]);
  const meter = (meterId: string, unit: string, kind: 'electricity' | 'water') => ({
    id: meterId,
    household_id: HOUSEHOLD,
    property_id: property,
    unit_id: unit,
    kind,
    pricing: flat(kind === 'electricity' ? 3_500 : 18_000),
  });
  await post('meters', [meter(meters.aPower, rooms.a, 'electricity'), meter(meters.aWater, rooms.a, 'water'), meter(meters.bPower, rooms.b, 'electricity'), meter(meters.bWater, rooms.b, 'water'), meter(meters.cPower, rooms.c, 'electricity')]);
  await post(
    'meter_readings',
    Object.entries(AUGUST).map(([key, reading]) => ({ household_id: HOUSEHOLD, meter_id: meters[key as keyof typeof meters], reading_month: '2026-08-01', reading, read_on: '2026-09-02' })),
  );
  await post('parties', { id: tenant, household_id: HOUSEHOLD, kind: 'individual', full_name: 'Lê Văn Demo', tags: ['tenant'] });
  const lease = { household_id: HOUSEHOLD, property_id: property, tenant_party_id: tenant, rent_vnd: 2_500_000, billing_cycle_months: 1, utilities_mode: 'metered_by_owner', due_offset_days: 0 };
  await post('leases', [
    { id: leases.a, unit_id: rooms.a, start_date: '2026-08-25', end_date: '2027-08-24', period_anchor: 'lease_start', ...lease },
    { id: leases.b, unit_id: rooms.b, start_date: '2026-08-25', end_date: '2027-08-24', period_anchor: 'lease_start', ...lease },
    { id: leases.c, unit_id: rooms.c, start_date: '2026-08-01', end_date: '2027-07-31', period_anchor: 'calendar_month', ...lease },
  ]);
  for (const [leaseId, paidThrough] of [
    [leases.a, '2026-09-24'],
    [leases.b, '2026-09-24'],
    [leases.c, '2026-09-30'],
  ] as const) {
    const { error } = await client.rpc('activate_lease', { p_lease_id: leaseId, p_paid_through: paidThrough });
    if (error) throw error;
  }
}

async function bill(leaseId: string, periodStart: string) {
  const { data, error } = await client
    .from('invoices')
    .select('status, issue_on, lines:invoice_lines(kind, quantity, unit_price_vnd, amount_vnd, sort_order)')
    .eq('lease_id', leaseId)
    .eq('period_start', periodStart)
    .single();
  if (error) throw error;
  return { status: data.status, issue_on: data.issue_on, lines: data.lines.toSorted((a, b) => a.sort_order - b.sort_order).map(({ kind, quantity, unit_price_vnd, amount_vnd }) => ({ kind, quantity, unit_price_vnd, amount_vnd })) };
}

const september = (readings: Partial<Record<keyof typeof meters, number>>) => ({
  property_id: property,
  reading_month: '2026-09-01',
  readings: Object.entries(readings).map(([key, reading]) => ({ meter_id: meters[key as keyof typeof meters], reading })),
});

beforeAll(async () => {
  await signIn();
  await seedDemoRoomingHouse();
}, 30_000);

describe('saveReadings against local Supabase (LSE-4)', () => {
  it("issues Phòng A's October bill the day both its meters are read, with September's use at each meter's price", async () => {
    expect(await bill(leases.a, '2026-10-25')).toMatchObject({ status: 'draft', issue_on: '2026-10-25', lines: [{ kind: 'rent' }] });
    expect(await saveReadings(september({ aPower: 1200, aWater: 50 }))).toEqual({ ok: true, value: { saved: 2, issued: 1, unbilled: 0 } });
    expect(await bill(leases.a, '2026-10-25')).toEqual({
      status: 'issued',
      issue_on: '2026-10-07',
      lines: [
        { kind: 'rent', quantity: 1, unit_price_vnd: 2_500_000, amount_vnd: 2_500_000 },
        { kind: 'electricity', quantity: 200, unit_price_vnd: 3_500, amount_vnd: 700_000 },
        { kind: 'water', quantity: 10, unit_price_vnd: 18_000, amount_vnd: 180_000 },
      ],
    });
  });

  it("leaves Phòng B's October bill a draft while its water is unread", async () => {
    expect(await saveReadings(september({ bPower: 2150 }))).toEqual({ ok: true, value: { saved: 1, issued: 0, unbilled: 0 } });
    expect(await bill(leases.b, '2026-10-25')).toMatchObject({ status: 'draft', lines: [{ kind: 'rent' }, { kind: 'electricity', quantity: 150, amount_vnd: 525_000 }] });
  });

  it("puts Phòng C's September use, read after its October bill went out, on November's draft and leaves October as it was", async () => {
    const october = await bill(leases.c, '2026-10-01');
    expect(october).toMatchObject({ status: 'issued', lines: [{ kind: 'rent' }] });
    expect(await saveReadings(september({ cPower: 560 }))).toEqual({ ok: true, value: { saved: 1, issued: 0, unbilled: 0 } });
    expect(await bill(leases.c, '2026-10-01')).toEqual(october);
    expect(await bill(leases.c, '2026-11-01')).toEqual({
      status: 'draft',
      issue_on: '2026-11-01',
      lines: [
        { kind: 'rent', quantity: 1, unit_price_vnd: 2_500_000, amount_vnd: 2_500_000 },
        { kind: 'adjustment', quantity: 60, unit_price_vnd: 3_500, amount_vnd: 210_000 },
      ],
    });
  });

  it('refuses a reading below August, saves nothing, and changes nothing for the same readings again', async () => {
    expect(await saveReadings(september({ bWater: 69 }))).toEqual({ ok: false, reason: 'belowPrevious' });
    const { data } = await client.from('meter_readings').select('reading').eq('meter_id', meters.bWater).eq('reading_month', '2026-09-01');
    expect(data).toEqual([]);
    expect(await saveReadings(september({ aPower: 1200, aWater: 50 }))).toEqual({ ok: true, value: { saved: 0, issued: 0, unbilled: 0 } });
  });
});
