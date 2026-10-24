import { describe, expect, test, vi } from 'vitest';

const PROPERTY = '00000000-0000-4000-8000-0000000000a1';
const ROOM_1 = '00000000-0000-4000-8000-000000000a01';
const ROOM_2 = '00000000-0000-4000-8000-000000000a02';

const db = vi.hoisted(() => ({ units: [] as { id: string; label: string; sort_order: number }[], saved: [] as unknown[][], updates: 0 }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ role: 'member', household: { id: '0943e55d-b0a6-5aef-839d-07c8693c520e' } }) }));
vi.mock('@/server/ops', () => ({ webOpContext: async () => ({}) }));
vi.mock('@/server/properties/rental', () => ({
  ACCOUNT_COLUMNS: '',
  UNIT_COLUMNS: '',
  loadPropertyRental: async () => ({ units: db.units, accounts: [] }),
}));
vi.mock('@/server/supabase/server', () => ({
  createSessionClient: async () => ({
    from: () => ({
      update: () => {
        db.updates += 1;
        const rows = db.saved.shift() ?? [];
        const builder = { match: () => builder, eq: () => builder, select: () => Promise.resolve({ data: rows, error: null }) };
        return builder;
      },
    }),
  }),
}));

const { moveUnitAction, sortUnitsByRoomNumber } = await import('./actions');

function twoRooms() {
  db.units = [
    { id: ROOM_1, label: 'Phòng 2', sort_order: 0 },
    { id: ROOM_2, label: 'Phòng 1', sort_order: 1 },
  ];
  db.updates = 0;
}

describe('room moves', () => {
  test('a move the database refused for every row is not reported as saved', async () => {
    twoRooms();
    db.saved = [[], []];
    expect(await moveUnitAction(PROPERTY, ROOM_1, 'down')).toEqual({ ok: false, reason: 'failed' });
  });

  test('sorting that wrote no row is not reported as saved', async () => {
    twoRooms();
    db.saved = [[], []];
    expect(await sortUnitsByRoomNumber(PROPERTY)).toEqual({ ok: false, reason: 'failed' });
  });

  test('a move that wrote every changed row is saved', async () => {
    twoRooms();
    db.saved = [[{ id: ROOM_1 }], [{ id: ROOM_2 }]];
    expect(await moveUnitAction(PROPERTY, ROOM_1, 'down')).toEqual({ ok: true, id: PROPERTY });
    expect(db.updates).toBe(2);
  });

  test('a room that is not in the property is refused, and a move past the end is a quiet no-op', async () => {
    twoRooms();
    expect(await moveUnitAction(PROPERTY, '00000000-0000-4000-8000-000000000a99', 'up')).toEqual({ ok: false, reason: 'failed' });
    expect(await moveUnitAction(PROPERTY, ROOM_1, 'up')).toEqual({ ok: true, id: PROPERTY });
    expect(db.updates).toBe(0);
  });

  test('a property with no rooms in reach is refused', async () => {
    db.units = [];
    expect(await sortUnitsByRoomNumber(PROPERTY)).toEqual({ ok: false, reason: 'failed' });
  });
});
