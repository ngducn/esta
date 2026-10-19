import { randomUUID } from 'node:crypto';
import { personCreate, propertyCreate, runOp, unitCreate, type Db } from '@esta/ops';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { appliedSchema, call, clientAt, demoProperty, laneContext, plannedSchema, sessionFiles, signIn, startConnector, type Connector } from './test/connector';

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
afterAll(() => sessions.discard());

describe('a room and its tenant planned by talking to Claude', () => {
  const file = sessions.make();
  let connector: Connector;
  let db: Db;
  let tenantId = '';

  beforeAll(async () => {
    expect(await signIn(OPERATOR, file)).toMatchObject({ ok: true, value: { householdName: `Gia đình Demo ${LANE}` } });
    db = clientAt(file);
    connector = await startConnector(file);
  }, 60_000);

  afterAll(async () => {
    await connector.client.close();
  });

  const plan = (summary: string, items: unknown[]) => call(connector, 'plan_changes', { summary, items });
  const apply = async (planId: string) => appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planId })).json());
  const without = <T extends Record<string, unknown>>(row: T | null, ...keys: string[]) => Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !keys.includes(key)));

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
