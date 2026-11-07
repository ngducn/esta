import { describe, expect, test, vi } from 'vitest';

const PROPERTY = '00000000-0000-4000-8000-0000000000a1';
const ROOM_1 = '00000000-0000-4000-8000-000000000a01';
const ROOM_2 = '00000000-0000-4000-8000-000000000a02';

const ops = vi.hoisted(() => ({ calls: [] as { op: string; raw: unknown }[], answer: { ok: true, value: { id: 'x', moved: 2 } } as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/ops', () => ({ webOpContext: async () => ({}) }));
vi.mock('@/server/properties/rental', () => ({
  loadPropertyRental: async () => ({
    units: [
      { id: ROOM_1, label: 'Phòng 2', sort_order: 0 },
      { id: ROOM_2, label: 'Phòng 1', sort_order: 1 },
    ],
    accounts: [],
  }),
}));
vi.mock('@esta/ops', async (original) => {
  const real = await original<typeof import('@esta/ops')>();
  return {
    ...real,
    runOp: async (op: unknown, _ctx: unknown, raw: unknown) => {
      ops.calls.push({ op: Object.entries(real).find(([, value]) => value === op)?.[0] ?? 'unknown', raw });
      return ops.answer;
    },
  };
});

const actions = await import('./actions');

function answer(value: unknown) {
  ops.calls = [];
  ops.answer = value;
}

describe('room moves', () => {
  test('a move sends every renumbered room to one reorder call', async () => {
    answer({ ok: true, value: { moved: 2 } });
    expect(await actions.moveUnitAction(PROPERTY, ROOM_1, 'down')).toEqual({ ok: true, id: PROPERTY });
    expect(ops.calls).toEqual([
      {
        op: 'unitsReorder',
        raw: {
          property_id: PROPERTY,
          changes: [
            { id: ROOM_2, sort_order: 0 },
            { id: ROOM_1, sort_order: 1 },
          ],
        },
      },
    ]);
  });

  test('a reorder the database refused is not reported as saved', async () => {
    answer({ ok: false, reason: { kind: 'units_changed' } });
    expect(await actions.sortUnitsByRoomNumber(PROPERTY)).toEqual({ ok: false, reason: 'failed' });
  });

  test('a room that is not in the property is refused before any write, and a move past the end sends no change', async () => {
    answer({ ok: true, value: { moved: 0 } });
    expect(await actions.moveUnitAction(PROPERTY, '00000000-0000-4000-8000-000000000a99', 'up')).toEqual({ ok: false, reason: 'failed' });
    expect(ops.calls).toEqual([]);
    expect(await actions.moveUnitAction(PROPERTY, ROOM_1, 'up')).toEqual({ ok: true, id: PROPERTY });
    expect(ops.calls).toEqual([{ op: 'unitsReorder', raw: { property_id: PROPERTY, changes: [] } }]);
  });
});

describe('deleting', () => {
  test('a room with leases says so, and any other refusal is a plain failure', async () => {
    answer({ ok: false, reason: { kind: 'unit_has_leases' } });
    expect(await actions.deleteUnit(ROOM_1)).toEqual({ ok: false, hasLeases: true });
    answer({ ok: false, reason: { kind: 'invalid', issues: [] } });
    expect(await actions.deleteUnit(ROOM_1)).toEqual({ ok: false });
  });

  test('a delete hands back the id and nothing else, and undo sends that id to the restore op', async () => {
    answer({ ok: true, value: { id: ROOM_1 } });
    expect(await actions.deleteUnit(ROOM_1)).toEqual({ ok: true, deleted: { id: ROOM_1 } });
    expect(await actions.restoreUnit({ id: ROOM_1 })).toEqual({ ok: true, id: ROOM_1 });
    expect(await actions.deleteAccount(ROOM_2)).toEqual({ ok: true, value: { id: ROOM_1 } });
    expect(await actions.restoreAccount({ id: ROOM_2 })).toEqual({ ok: true, id: ROOM_1 });
    expect(ops.calls.map((call) => call.op)).toEqual(['unitDelete', 'unitRestore', 'utilityAccountDelete', 'utilityAccountRestore']);
  });
});

describe('utility accounts (#356)', () => {
  const blank = { kind: 'water', unit_id: null, provider: null, customer_code: null, holder_name: null, note: 'Đồng hồ tầng trệt' };

  test('a new account is created under a minted id and an edit updates the id it names', async () => {
    answer({ ok: true, value: { id: ROOM_1 } });
    expect(await actions.saveAccount(PROPERTY, null, blank)).toEqual({ ok: true, id: ROOM_1 });
    expect(await actions.saveAccount(PROPERTY, ROOM_2, blank)).toEqual({ ok: true, id: ROOM_1 });
    expect(ops.calls.map((call) => call.op)).toEqual(['utilityAccountCreate', 'utilityAccountUpdate']);
    expect(ops.calls[1]?.raw).toEqual({ id: ROOM_2, property_id: PROPERTY, account: blank });
  });
});
