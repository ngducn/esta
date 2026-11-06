import { describe, expect, it } from 'vitest';
import { fakeDb, opContext as context, trashedProperty } from './test/fake-db';
import { unitAddRooms, unitCreate, unitDelete, unitRestore, unitsReorder, unitUpdate } from './unit-ops';
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

describe('unitUpdate', () => {
  const stored = { label: 'Phòng 2', kind: 'room', area_m2: null, list_rent_vnd: 9_000_000, available_from: null };
  const input = (unit: object) => unitUpdate.input.parse({ id: ROOM, property_id: PROPERTY, unit });

  it('writes only the columns that differ from the stored room', async () => {
    const { db } = fakeDb((request) => (request.table === 'units' && request.query.get('select') !== 'id,property_id,label' ? [stored] : []));
    const planned = await unitUpdate.plan(context(db), input({ ...phong2, list_rent_vnd: 9_500_000 }));
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { id: ROOM, set: { list_rent_vnd: 9_500_000 } } } });
  });

  it('plans unchanged when the form holds what is stored, and not found for a room in the trash', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'units' && request.query.get('select') !== 'id,property_id,label' ? [stored] : []));
    expect(await unitUpdate.plan(context(db), input(phong2))).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ROOM, label: 'Phòng 2' } } });
    expect(sent[0]?.query.get('deleted_at')).toBe('is.null');
    expect(await unitUpdate.plan(context(fakeDb().db), input(phong2))).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('refuses a label another live room holds', async () => {
    const { db } = fakeDb((request) => (request.query.get('select') === 'id,property_id,label' ? [{ id: OTHER_ROOM, property_id: PROPERTY, label: 'Phòng 3' }] : [stored]));
    expect(await unitUpdate.plan(context(db), input({ ...phong2, label: 'Phòng 3' }))).toEqual({ ok: false, reason: { kind: 'label_taken', label: 'Phòng 3', takenBy: OTHER_ROOM } });
  });
});

describe('unitAddRooms', () => {
  const input = unitAddRooms.input.parse({ property_id: PROPERTY, labels: ['Phòng 3', 'Phòng 4'], list_rent_vnd: null });

  it('plans unchanged when every label is already a live room, so a second tap adds nothing', async () => {
    const { db } = fakeDb(() => [{ label: 'Phòng 3' }, { label: 'Phòng 4' }]);
    expect(await unitAddRooms.plan(context(db), input)).toEqual({ ok: true, value: { kind: 'unchanged', current: { added: 0 } } });
    expect((await unitAddRooms.plan(context(fakeDb(() => [{ label: 'Phòng 3' }]).db), input)).ok).toBe(true);
  });

  it('numbers the rooms in one function call and reads a missing property as not found', async () => {
    const added = fakeDb(() => 2 as never);
    expect(await unitAddRooms.apply(context(added.db), input)).toEqual({ ok: true, value: { added: 2 } });
    expect(added.sent[0]).toMatchObject({ method: 'POST', table: 'rpc/add_rooms', body: { p_property_id: PROPERTY, p_labels: ['Phòng 3', 'Phòng 4'] } });
    const missing = fakeDb(() => [], () => ({ code: 'P0002', message: 'ESTA_PROPERTY_NOT_FOUND' }));
    expect(await unitAddRooms.apply(context(missing.db), input)).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });
});

describe('unitsReorder', () => {
  const changes = [{ id: ROOM, sort_order: 1 }, { id: OTHER_ROOM, sort_order: 0 }];

  it('sends every renumbered room to one function call, and nothing when none moved', async () => {
    const input = unitsReorder.input.parse({ property_id: PROPERTY, changes });
    expect(await unitsReorder.plan(context(fakeDb().db), unitsReorder.input.parse({ property_id: PROPERTY, changes: [] }))).toEqual({ ok: true, value: { kind: 'unchanged', current: { moved: 0 } } });
    const moved = fakeDb(() => 2 as never);
    expect(await unitsReorder.apply(context(moved.db), input)).toEqual({ ok: true, value: { moved: 2 } });
    expect(moved.sent).toMatchObject([{ table: 'rpc/reorder_units', body: { p_property_id: PROPERTY, p_changes: changes } }]);
  });

  it('refuses all of it when a room is gone', async () => {
    const gone = fakeDb(() => [], () => ({ code: 'P0002', message: 'ESTA_UNITS_CHANGED' }));
    expect(await unitsReorder.apply(context(gone.db), { property_id: PROPERTY, changes })).toEqual({ ok: false, reason: { kind: 'units_changed' } });
  });
});

describe('deleting and restoring a room', () => {
  it('say that a room with leases cannot go to the trash', async () => {
    const refused = fakeDb(() => [], () => ({ code: '23503', message: 'ESTA_UNIT_HAS_LEASES' }));
    expect(await unitDelete.apply(context(refused.db), { id: ROOM })).toEqual({ ok: false, reason: { kind: 'unit_has_leases' } });
  });

  it('restore by id with one update that clears the stamp', async () => {
    const { db, sent } = fakeDb((request) => (request.method === 'PATCH' ? [{ id: ROOM }] : [{ id: ROOM, deleted_at: '2026-10-07T00:00:00Z' }]));
    const planned = await unitRestore.plan(context(db), { id: ROOM });
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { id: ROOM } } });
    expect(await unitRestore.apply(context(db), { id: ROOM })).toEqual({ ok: true, value: { id: ROOM } });
    expect(sent.filter((request) => request.method === 'PATCH')).toMatchObject([{ body: { deleted_at: null } }]);
  });
});
