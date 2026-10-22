import { randomUUID } from 'node:crypto';
import { formatVnd } from '@esta/core/format';
import { LEASE_DEFAULTS } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { LEASE_COLUMNS } from '@esta/core/schemas/lease';
import { depositRecord, leaseActivate, leaseCreate, leaseEdit, personCreate, propertyCreate, runOp, unitCreate, type Db } from '@esta/ops';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { businessChecksums } from '../../../scripts/db-checksum.ts';
import { e2eServiceHeaders } from '../../../scripts/e2e-service.ts';
import { parseSlot, slotWorkdir } from '../../../scripts/slot.ts';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { appliedSchema, call, clientAt, env, laneContext, ROOT, plannedSchema, sessionFiles, signIn, startConnector, type Connector } from './test/connector';
import { demoProperty } from './test/demo-property';
import { actAs, blockedOn, psqlSession } from './test/psql';

// Run against a fresh `pnpm db:reset`.
const LANE = 7;
const OPERATOR = `ryan.lane${LANE}@demo.esta.test`;
const FULL_CCCD = '079301004567';
const SEEDED_TENANT = { id: seedId(`seed:party:tenant-lane-${LANE}:di-an:1`), full_name: 'Nguyễn Văn An Demo', phone: '0901 111 001' };

const room = (label: string) => ({ label, kind: 'room', area_m2: 18, list_rent_vnd: 3_500_000, available_from: null });
const hoa = { full_name: 'Trương Thị Hoa Demo', phone: '0987 654 321' };
const UNIT_COLUMNS = 'household_id, property_id, label, kind, area_m2, list_rent_vnd, available_from, sort_order, created_by';
const PARTY_COLUMNS = 'household_id, kind, full_name, short_name, phone, zalo_phone, email, id_last4, tax_code, address_text, notes, tags, member_id, created_by';
const candidatesSchema = z.object({
  candidates: z.array(z.object({ id: z.string(), full_name: z.string(), phone: z.string().nullable(), id_last4: z.string().nullable(), reasons: z.array(z.string()) })),
});

const sessions = sessionFiles();
const file = sessions.make();
let connector: Connector;
let db: Db;

beforeAll(async () => {
  expect(await signIn(OPERATOR, file)).toMatchObject({ ok: true, value: { householdName: `Gia đình Demo ${LANE}` } });
  db = clientAt(file);
  connector = await startConnector(file);
}, 60_000);

afterAll(async () => {
  await connector.client.close();
  await sessions.discard();
});

const plan = (summary: string, items: unknown[]) => call(connector, 'plan_changes', { summary, items });
const apply = async (planId: string) => appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planId })).json());
const without = <T extends Record<string, unknown>>(row: T | null, ...keys: string[]) => Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !keys.includes(key)));

describe('a room and its tenant planned by talking to Claude', () => {
  let tenantId = '';

  it('adds a property, a room on it named by ref, and a tenant, writing the rows the screens write and only the last four ID digits', async () => {
    const summary = `Demo: phòng 1 ở nhà mới cho chị Hoa Demo, CCCD ${FULL_CCCD}`;
    const planned = plannedSchema.parse(
      (
        await plan(summary, [
          { op: 'property.create', ref: 'house', input: { property: demoProperty('C2ROOM') } },
          { op: 'unit.create', input: { property_id: { $ref: 'house' }, unit: room('Phòng 1') } },
          { op: 'person.create', input: { person: { ...hoa, id_last4: FULL_CCCD } } },
        ])
      ).json(),
    );
    const [house, unit, person] = planned.items;
    expect(planned.items).toMatchObject([{ status: 'change' }, { status: 'change', change: { property_id: house?.id } }, { status: 'change', change: { row: { id_last4: '4567' } } }]);
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: [{ status: 'landed' }, { status: 'landed' }, { status: 'landed' }] });
    tenantId = person?.id ?? '';

    const ctx = await laneContext(db, LANE);
    const screenProperty = randomUUID();
    const [screenRoom, screenTenant] = [randomUUID(), randomUUID()];
    expect(await runOp(propertyCreate, ctx, { id: screenProperty, property: demoProperty('C2FORM') })).toMatchObject({ ok: true });
    expect(await runOp(unitCreate, ctx, { id: screenRoom, property_id: screenProperty, unit: room('Phòng 1') })).toMatchObject({ ok: true });
    expect(await runOp(personCreate, ctx, { id: screenTenant, person: { ...hoa, id_last4: '4567' }, allow_duplicate: true })).toMatchObject({ ok: true });

    const units = await db.from('units').select(`id, ${UNIT_COLUMNS}`).in('id', [unit?.id ?? '', screenRoom]);
    const viaClaude = units.data?.find((row) => row.id === unit?.id) ?? null;
    const viaScreen = units.data?.find((row) => row.id === screenRoom) ?? null;
    expect(viaClaude, 'the room landed on the property planned beside it').toMatchObject({ property_id: house?.id, label: 'Phòng 1' });
    expect(without(viaClaude, 'id', 'property_id')).toEqual(without(viaScreen, 'id', 'property_id'));

    const parties = await db.from('parties').select(`id, ${PARTY_COLUMNS}`).in('id', [tenantId, screenTenant]);
    const tenant = parties.data?.find((row) => row.id === tenantId) ?? null;
    expect(tenant).toMatchObject({ full_name: 'Trương Thị Hoa Demo', phone: '+84987654321', id_last4: '4567', tags: ['tenant'] });
    expect(without(tenant, 'id')).toEqual(without(parties.data?.find((row) => row.id === screenTenant) ?? null, 'id'));

    const batch = await db.from('change_batches').select('*').eq('id', planned.planId).single();
    const audit = await db.from('audit_log').select('diff').in('row_id', [planned.planId, tenantId]);
    const written = JSON.stringify([batch.data, audit.data, tenant]);
    expect(written).toContain('4567');
    expect(written, 'no full ID number in the batch, its audit rows or the person').not.toContain(FULL_CCCD);
  });

  it('refuses a room whose property was refused at apply as blocked, lands the tenant, and ends partial', async () => {
    const planned = plannedSchema.parse(
      (
        await plan('Demo: nhà mới, phòng 1 và người thuê', [
          { op: 'property.create', ref: 'house', input: { property: demoProperty('C2BLOCK') } },
          { op: 'unit.create', input: { property_id: { $ref: 'house' }, unit: room('Phòng 1') } },
          { op: 'person.create', input: { person: { full_name: 'Đỗ Văn Khoa Demo', phone: '0987 000 111', id_last4: null } } },
        ])
      ).json(),
    );
    expect(await runOp(propertyCreate, await laneContext(db, LANE), { id: randomUUID(), property: demoProperty('C2BLOCK') })).toMatchObject({ ok: true });
    expect(await apply(planned.planId)).toMatchObject({
      status: 'partial',
      items: [{ status: 'refused', refusal: { kind: 'code_taken', code: 'C2BLOCK' } }, { status: 'refused', refusal: { kind: 'blocked', by: [0] } }, { status: 'landed' }],
    });
    const rows = await db.from('units').select('id').eq('id', planned.items[1]?.id ?? '');
    expect(rows.data, 'no room row').toEqual([]);
  });

  it("refuses a person with a seeded tenant's phone as a possible duplicate, then adds them once Ryan says it is someone else", async () => {
    const item = (allow: boolean) => ({ op: 'person.create', input: { person: { full_name: 'An Demo', phone: SEEDED_TENANT.phone, id_last4: null }, allow_duplicate: allow } });
    const refused = await plan('Demo: thêm người thuê', [item(false)]);
    expect(refused.isError).toBe(true);
    expect(refused.json()).toMatchObject({
      kind: 'items_refused',
      items: [{ status: 'refused', refusal: { kind: 'possible_duplicate', people: [{ id: SEEDED_TENANT.id, full_name: SEEDED_TENANT.full_name, reasons: ['phone'] }] } }],
    });
    const planned = plannedSchema.parse((await plan('Demo: thêm người thuê khác', [item(true)])).json());
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: [{ status: 'landed' }] });
    const rows = await db.from('parties').select('id').eq('id', planned.items[0]?.id ?? '');
    expect(rows.data).toHaveLength(1);
  });

  it("refuses a room on another household's property and an unknown ref at plan", async () => {
    const refused = await plan('Demo: phòng ở nhà khác', [
      { op: 'unit.create', input: { property_id: seedId('seed:property:lane-8:q7'), unit: room('Phòng 9') } },
      { op: 'unit.create', input: { property_id: { $ref: 'nowhere' }, unit: room('Phòng 9') } },
    ]);
    expect(refused.json()).toMatchObject({
      kind: 'items_refused',
      items: [
        { status: 'refused', refusal: { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] } },
        { status: 'refused', refusal: { kind: 'unknown_ref', ref: 'nowhere' } },
      ],
    });
  });

  it('finds the tenant Claude added by name, by phone and by the last four ID digits', async () => {
    const find = async (args: Record<string, string>) => candidatesSchema.parse((await call(connector, 'find_person', args)).json()).candidates;
    expect(await find({ name: 'hoa demo' })).toContainEqual({ id: tenantId, full_name: 'Trương Thị Hoa Demo', phone: '0987 654 321', id_last4: '4567', reasons: ['name'] });
    expect(await find({ phone: '+84 987 654 321' })).toContainEqual(expect.objectContaining({ id: tenantId, reasons: ['phone'] }));
    expect(await find({ id_last4: '4567' })).toContainEqual(expect.objectContaining({ id: tenantId, reasons: ['id_last4'] }));
  });
});

const Q1 = seedId(`seed:property:lane-${LANE}:q1`);
const OTHER_LEASE = seedId('seed:lease:lane-8:q7:1');
const PAID_THROUGH = '2026-09-30';
const display = (amount: number) => formatVnd(vnd(amount), 'vi');

/** Chị Lan Demo's room from 01/03/2026 at 9.000.000 ₫ with two months' deposit, LEASE_DEFAULTS for a room otherwise, as Claude fills it. */
const draft = (unitId: unknown, tenantId: unknown) => {
  const terms = LEASE_DEFAULTS.room;
  return {
    unit_id: unitId,
    tenant_party_id: tenantId,
    start_date: '2026-03-01',
    end_date: null,
    rent_vnd: 9_000_000,
    deposit_vnd: 18_000_000,
    escalation: { kind: 'none' },
    billing_cycle_months: terms.billingCycleMonths,
    period_anchor: terms.periodAnchor,
    first_period_proration: terms.firstPeriodProration,
    utilities_mode: terms.utilitiesMode,
    tax_payer: terms.taxPayer,
    notice_days: terms.noticeDays,
  };
};
const deposit = (leaseId: unknown) => ({ lease_id: leaseId, kind: 'received', amount_vnd: 18_000_000, on_date: '2026-03-01', note: null });
const rental = (label: string, phone: string) => [
  { op: 'unit.create', ref: 'room', input: { property_id: Q1, unit: room(label) } },
  { op: 'person.create', ref: 'lan', input: { person: { full_name: 'Lan Demo', phone, id_last4: null } } },
  { op: 'lease.create', ref: 'lease', input: { property_id: Q1, lease: draft({ $ref: 'room' }, { $ref: 'lan' }) } },
  { op: 'lease.activate', input: { lease_id: { $ref: 'lease' }, paid_through: PAID_THROUGH } },
  { op: 'deposit.record', input: deposit({ $ref: 'lease' }) },
];

const HOUSEHOLD = seedId(`seed:household:lane-${LANE}`);

/** The nightly invoicing for lane 7 alone, as the cron route runs it with the service role. */
async function nightlyRun(asOf: string) {
  const response = await fetch(`${env.ESTA_IT_SUPABASE_URL}/rest/v1/rpc/run_invoicing`, {
    method: 'POST',
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ p_household_id: HOUSEHOLD, p_as_of: asOf, p_issued_at: `${asOf}T00:30:00+07:00` }),
  });
  expect(response.ok, await response.text()).toBe(true);
}

/** What a lease bills and holds, without ids: its row, its periods, its invoices and its deposit ledger. */
async function billed(id: string) {
  const [lease, schedule, invoices, entries, held] = await Promise.all([
    db.from('leases').select(`${LEASE_COLUMNS}, created_by`).eq('id', id).single(),
    db.rpc('lease_schedule', { p_lease_ids: [id], p_until: '2027-03-31' }),
    db.from('invoice_balances').select('period_start, period_end, due_date, issue_on, status, total_vnd, outstanding_vnd').eq('lease_id', id).order('period_start'),
    db.from('deposit_entries').select('kind, amount_vnd, on_date, note, payment_id, created_by').eq('lease_id', id),
    db.from('lease_deposits').select('held_vnd').eq('lease_id', id).single(),
  ]);
  return {
    lease: without(lease.data, 'id', 'unit_id', 'tenant_party_id'),
    schedule: (schedule.data ?? []).map((period) => without(period, 'lease_id', 'invoice_id')),
    invoices: invoices.data,
    entries: entries.data,
    held: held.data,
  };
}

describe('a lease with its deposit and paid-through started by talking to Claude', () => {
  let leaseId = '';

  it('plans the Demo rental in one batch, shows the first bills and the deposit, and lands every item', async () => {
    const reply = await plan('Demo: Phòng 2 ở Q1 cho chị Lan Demo thuê 9.000.000 ₫ từ 01/03/2026, cọc 18.000.000 ₫, đã thu đến 30/09/2026', rental('Phòng 2', '0901 234 567'));
    expect(reply.json()).toMatchObject({
      items: [
        { status: 'change' },
        { status: 'change' },
        { status: 'change', change: { row: { property_id: Q1, status: 'draft', paid_through_date: null, due_offset_days: 0 } } },
        {
          status: 'change',
          change: { paid_through: PAID_THROUGH },
          preview: {
            paid_through_display: '30/09/2026',
            bills: [
              { period_start: '2026-10-01', period_end: '2026-10-31', rent_vnd: 9_000_000, rent_display: display(9_000_000), issues_now: true },
              { period_start: '2026-11-01', issues_now: false },
            ],
          },
        },
        { status: 'change', preview: { amount_display: display(18_000_000), on_date_display: '01/03/2026', held_after_display: display(18_000_000) } },
      ],
    });
    const planned = plannedSchema.parse(reply.json());
    leaseId = planned.items[2]?.id ?? '';
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: Array.from({ length: 5 }, () => ({ status: 'landed' })) });
  });

  it('bills and holds exactly what the same lease entered on the screens does, through a nightly run', async () => {
    const ctx = await laneContext(db, LANE);
    const [unit, tenant, lease] = [randomUUID(), randomUUID(), randomUUID()];
    expect(await runOp(unitCreate, ctx, { id: unit, property_id: Q1, unit: room('Phòng 3') })).toMatchObject({ ok: true });
    expect(await runOp(personCreate, ctx, { id: tenant, person: { full_name: 'Lan Demo', phone: '0901 234 567' }, allow_duplicate: true })).toMatchObject({ ok: true });
    expect(await runOp(leaseCreate, ctx, { id: lease, property_id: Q1, lease: draft(unit, tenant) })).toMatchObject({ ok: true });
    expect(await runOp(leaseActivate, ctx, { lease_id: lease, paid_through: PAID_THROUGH })).toMatchObject({ ok: true });
    expect(await runOp(depositRecord, ctx, { id: randomUUID(), ...deposit(lease) })).toMatchObject({ ok: true });
    await nightlyRun('2026-11-01');

    const viaClaude = await billed(leaseId);
    expect(viaClaude.invoices?.slice(0, 2), 'October issued at activation, November by the nightly run').toMatchObject([
      { period_start: '2026-10-01', status: 'issued', total_vnd: 9_000_000 },
      { period_start: '2026-11-01', status: 'issued', total_vnd: 9_000_000 },
    ]);
    expect(viaClaude).toMatchObject({
      lease: { property_id: Q1, status: 'active', paid_through_date: PAID_THROUGH, rent_vnd: 9_000_000 },
      entries: [{ kind: 'received', amount_vnd: 18_000_000, on_date: '2026-03-01' }],
      held: { held_vnd: 18_000_000 },
    });
    expect(viaClaude.schedule.find((period) => period.period_start === '2026-09-01')).toMatchObject({ covered_by_paid_through: true });
    expect(viaClaude).toEqual(await billed(lease));
  });

  it('refuses the lease, its activation and its deposit as blocked when its room is refused at apply, and lands the tenant', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 5 ở Q1 cho chị Lan Demo', rental('Phòng 5', '0987 000 222'))).json());
    expect(await runOp(unitCreate, await laneContext(db, LANE), { id: randomUUID(), property_id: Q1, unit: room('Phòng 5') })).toMatchObject({ ok: true });
    expect(await apply(planned.planId)).toMatchObject({
      status: 'partial',
      items: [
        { status: 'refused', refusal: { kind: 'label_taken', label: 'Phòng 5' } },
        { status: 'landed' },
        { status: 'refused', refusal: { kind: 'blocked', by: [0] } },
        { status: 'refused', refusal: { kind: 'blocked', by: [2] } },
        { status: 'refused', refusal: { kind: 'blocked', by: [2] } },
      ],
    });
    expect((await db.from('leases').select('id').eq('id', planned.items[2]?.id ?? '')).data, 'no lease row').toEqual([]);
  });

  it('refuses a lease edit as stale when the same term changed after Ryan approved it', async () => {
    const ctx = await laneContext(db, LANE);
    const [unit, lease] = [randomUUID(), randomUUID()];
    expect(await runOp(unitCreate, ctx, { id: unit, property_id: Q1, unit: room('Phòng 6') })).toMatchObject({ ok: true });
    expect(await runOp(leaseCreate, ctx, { id: lease, property_id: Q1, lease: draft(unit, null) })).toMatchObject({ ok: true });
    const planned = plannedSchema.parse((await plan('Demo: Phòng 6 lên 9.500.000 ₫', [{ op: 'lease.edit', input: { id: lease, set: { rent_vnd: 9_500_000 } } }])).json());
    expect(planned.items).toMatchObject([{ status: 'change', change: { before: { rent_vnd: 9_000_000 }, set: { rent_vnd: 9_500_000 } } }]);
    expect(await runOp(leaseEdit, ctx, { id: lease, property_id: Q1, set: { rent_vnd: 9_200_000 } })).toMatchObject({ ok: true });
    expect(await apply(planned.planId)).toMatchObject({ status: 'partial', items: [{ status: 'refused', refusal: { kind: 'stale' } }] });
    expect((await db.from('leases').select('rent_vnd').eq('id', lease).single()).data).toEqual({ rent_vnd: 9_200_000 });
  });

  it('refuses a room and a lease on a property in the trash as not found, at plan and at apply', async () => {
    const ctx = await laneContext(db, LANE);
    const [house, unit] = [randomUUID(), randomUUID()];
    expect(await runOp(propertyCreate, ctx, { id: house, property: demoProperty('C2TRASH') })).toMatchObject({ ok: true });
    expect(await runOp(unitCreate, ctx, { id: unit, property_id: house, unit: room('Phòng 1') })).toMatchObject({ ok: true });
    const items = [
      { op: 'unit.create', input: { property_id: house, unit: room('Phòng 2') } },
      { op: 'lease.create', input: { lease: draft(unit, SEEDED_TENANT.id) } },
    ];
    const notFound = (path: string) => ({ status: 'refused', refusal: { kind: 'invalid', issues: [{ path, code: 'not_found' }] } });
    const planned = plannedSchema.parse((await plan('Demo: phòng 2 và hợp đồng phòng 1 ở nhà C2TRASH', items)).json());
    const trashed = await db.from('properties').update({ deleted_at: '2026-10-07T09:00:00+07:00' }).eq('id', house).select('id');
    expect(trashed.data).toEqual([{ id: house }]);
    expect(await apply(planned.planId)).toMatchObject({ status: 'partial', items: [notFound('property_id'), notFound('lease.unit_id')] });
    expect((await plan('Demo: phòng 2 và hợp đồng phòng 1 sau khi xóa nhà', items)).json()).toMatchObject({ kind: 'items_refused', items: [notFound('property_id'), notFound('lease.unit_id')] });
    const landed = await Promise.all([db.from('units').select('id').eq('property_id', house), db.from('leases').select('id').eq('property_id', house)]);
    expect(landed.map((read) => read.data), 'only the room stored before the trash').toEqual([[{ id: unit }], []]);
  });

  it("refuses another household's lease for an activation and a deposit, and get_lease does not find it", async () => {
    const refused = await plan('Demo: hợp đồng nhà khác', [
      { op: 'lease.activate', input: { lease_id: OTHER_LEASE, paid_through: null } },
      { op: 'deposit.record', input: deposit(OTHER_LEASE) },
    ]);
    expect(refused.json()).toMatchObject({ kind: 'items_refused', items: [{ status: 'refused', refusal: { kind: 'not_found' } }, { status: 'refused', refusal: { kind: 'not_found' } }] });
    const read = await call(connector, 'get_lease', { id: OTHER_LEASE });
    expect([read.isError, read.json()]).toEqual([true, { error: 'not_found' }]);
  });

  it('reads the Demo lease back with display strings and its schedule, alone and in the property list', async () => {
    const summary = {
      id: leaseId,
      property: 'Mặt bằng Quận 1',
      unit: 'Phòng 2',
      tenant: expect.objectContaining({ full_name: 'Lan Demo', phone: '0901 234 567' }),
      status: 'active',
      start_date: '2026-03-01',
      rent_display: display(9_000_000),
      deposit_display: display(18_000_000),
      paid_through_date: PAID_THROUGH,
      held_deposit_vnd: 18_000_000,
      held_deposit_display: display(18_000_000),
    };
    expect((await call(connector, 'get_lease', { id: leaseId })).json()).toMatchObject({
      ...summary,
      billing_cycle_months: 1,
      schedule: expect.arrayContaining([
        expect.objectContaining({ period_start: '2026-09-01', covered_by_paid_through: true, invoice_id: null }),
        expect.objectContaining({ period_start: '2026-10-01', rent_display: display(9_000_000), covered_by_paid_through: false, invoice_status: 'issued' }),
      ]),
    });
    expect((await call(connector, 'list_leases', { property_id: Q1 })).json()).toMatchObject({ leases: expect.arrayContaining([expect.objectContaining(summary)]) });
  });
});

const tablesUndoRestores = () => businessChecksums(slotWorkdir(ROOT, parseSlot(env.ESTA_SLOT))).filter((table) => table.table !== 'change_batches');

describe('a Demo rental Claude applied, undone from the connector', () => {
  it('puts every table back as it was before the apply', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 7 ở Q1 cho chị Lan Demo', rental('Phòng 7', '0901 777 007'))).json());
    const before = tablesUndoRestores();
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: Array.from({ length: 5 }, () => ({ status: 'landed' })) });
    expect(tablesUndoRestores()).not.toEqual(before);
    expect((await call(connector, 'undo_batch', { batch_id: planned.planId })).json()).toEqual({ batch_id: planned.planId, archived_properties: 0 });
    expect(tablesUndoRestores()).toEqual(before);
    expect((await db.from('change_batches').select('status').eq('id', planned.planId).single()).data).toEqual({ status: 'undone' });
  });

  it('refuses once the nightly run issued a bill for the lease, says to void it, and changes nothing', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 8 ở Q1 cho chị Lan Demo', rental('Phòng 8', '0901 777 008'))).json());
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    await nightlyRun('2026-11-01');
    const before = tablesUndoRestores();
    const refused = await call(connector, 'undo_batch', { batch_id: planned.planId });
    expect(refused.isError).toBe(true);
    expect(refused.json()).toMatchObject({ kind: 'undo_blocked', blockers: expect.arrayContaining([expect.objectContaining({ table_name: 'invoices', reason: 'invoice_issued', flow: 'void' })]) });
    expect(tablesUndoRestores()).toEqual(before);
  });
});

describe('an undo racing a write to what the batch added', () => {
  const RYAN = seedId(`seed:user:ryan-lane-${LANE}`);
  const ME = seedId(`seed:user:me-lane-${LANE}`);

  /** Holds `write` open in one connection, starts Ryan's undo in another, commits the write, and returns the undo's answer. */
  async function undoDuring(batchId: string, write: string) {
    const [writer, undoer] = [psqlSession(), psqlSession()];
    try {
      await writer.run(write);
      const undone = undoer.run(`${actAs(RYAN)} select public.undo_change_batch('${batchId}');`);
      await blockedOn('undo_change_batch');
      await writer.run('commit;');
      const answer = (await undone).split('\n').at(-1) ?? '';
      await undoer.run('commit;');
      return JSON.parse(answer) as unknown;
    } finally {
      await Promise.all([writer.close(), undoer.close()]);
    }
  }

  it("refuses as edited when Mẹ's edit of the tenant Claude added commits while the undo waits, and keeps her edit", async () => {
    const planned = plannedSchema.parse((await plan('Demo: thêm người thuê Khoa Demo', [{ op: 'person.create', input: { person: { full_name: 'Khoa Demo', phone: '0901 777 011', id_last4: null } } }])).json());
    const tenant = planned.items[0]?.id ?? '';
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    const answer = await undoDuring(planned.planId, `${actAs(ME)} update public.parties set phone = '+84987000111' where id = '${tenant}';`);
    expect(answer).toMatchObject({ undone: false, blockers: [{ table_name: 'parties', row_id: tenant, reason: 'edited_after', flow: 'edit' }] });
    expect((await db.from('parties').select('phone').eq('id', tenant).single()).data).toEqual({ phone: '+84987000111' });
  });

  it('refuses as billed when the nightly run issues a bill for the lease Claude added while the undo waits, and keeps the bill', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 11 ở Q1 cho chị Lan Demo', rental('Phòng 11', '0901 777 012'))).json());
    const lease = planned.items[2]?.id ?? '';
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    const nightly = `begin; select set_config('request.headers', '{"x-esta-actor": "system:cron"}', true); set local role service_role;
      select public.run_invoicing('${HOUSEHOLD}', '2026-11-01', '2026-11-01T00:30:00+07:00');`;
    expect(await undoDuring(planned.planId, nightly)).toMatchObject({
      undone: false,
      blockers: expect.arrayContaining([expect.objectContaining({ table_name: 'invoices', reason: 'invoice_issued', flow: 'void' })]),
    });
    const bills = await db.from('invoices').select('period_start, status').eq('lease_id', lease).order('period_start');
    expect(bills.data?.slice(0, 2)).toEqual([
      { period_start: '2026-10-01', status: 'issued' },
      { period_start: '2026-11-01', status: 'issued' },
    ]);
  });
});
