import { describe, expect, it } from 'vitest';
import { fakeDb, opContext as context, trashedProperty } from './test/fake-db';
import { unitCreate } from './unit-ops';
import { NO_PENDING, withWrites } from './view';

const PROPERTY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0002';
const ROOM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0003';
const OTHER_ROOM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0004';

const plannedProperty = withWrites(NO_PENDING, [{ kind: 'create', table: 'properties', row: { id: PROPERTY, nickname: 'Demo Nhà Q7' } }]);
const phong2 = { label: 'Phòng 2', kind: 'room', area_m2: null, list_rent_vnd: 9_000_000, available_from: null };

const parse = (raw: unknown) => {
  const input = unitCreate.input.safeParse(raw);
  if (!input.success) throw new Error('expected the unit input to parse');
  return input.data;
};

describe('unitCreate', () => {
  it('takes the rental form as the screen sends it, and nothing else', () => {
    expect(unitCreate.input.safeParse({ id: ROOM, property_id: PROPERTY, unit: phong2 }).success).toBe(true);
    expect(unitCreate.input.safeParse({ id: ROOM, property_id: PROPERTY, unit: { ...phong2, label: ' ' } }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['unit.label']);
    expect(unitCreate.input.safeParse({ id: ROOM, property_id: PROPERTY, unit: { ...phong2, sort_order: 3 } }).success).toBe(false);
  });

  it('plans a room on a property planned earlier in the batch, without a place in the list', async () => {
    const { db } = fakeDb();
    const planned = await unitCreate.plan(context(db, plannedProperty), parse({ id: ROOM, property_id: PROPERTY, unit: phong2 }));
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { id: ROOM, property_id: PROPERTY, row: phong2 } } });
  });

  it('reads the property as not found when nothing is pending, as apply does before it lands, and when it is in the trash', async () => {
    const input = parse({ id: ROOM, property_id: PROPERTY, unit: phong2 });
    const notFound = { ok: false, reason: { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] } };
    expect(await unitCreate.plan(context(fakeDb().db), input)).toEqual(notFound);
    expect(await unitCreate.plan(context(fakeDb(trashedProperty()).db), input)).toEqual(notFound);
  });

  it('refuses a second room with the same label on the property, stored or planned in the same batch', async () => {
    const { db } = fakeDb();
    const pending = withWrites(plannedProperty, [{ kind: 'create', table: 'units', row: { id: OTHER_ROOM, property_id: PROPERTY, label: 'Phòng 2' } }]);
    const planned = await unitCreate.plan(context(db, pending), parse({ id: ROOM, property_id: PROPERTY, unit: phong2 }));
    expect(planned).toEqual({ ok: false, reason: { kind: 'label_taken', label: 'Phòng 2', takenBy: OTHER_ROOM } });
  });

  it('plans unchanged once its minted id is stored, before checking anything else', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'units' ? [{ id: ROOM, property_id: PROPERTY, label: 'Phòng 2' }] : []));
    const planned = await unitCreate.plan(context(db), parse({ id: ROOM, property_id: PROPERTY, unit: phong2 }));
    expect(planned).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ROOM, label: 'Phòng 2' } } });
    expect(sent).toHaveLength(1);
  });

  it('declares the row a later item reads before it lands', () => {
    expect(unitCreate.writes?.({ id: ROOM, property_id: PROPERTY, row: parse({ id: ROOM, property_id: PROPERTY, unit: phong2 }).unit })).toEqual([
      { kind: 'create', table: 'units', row: { id: ROOM, property_id: PROPERTY, label: 'Phòng 2' } },
    ]);
  });
});
