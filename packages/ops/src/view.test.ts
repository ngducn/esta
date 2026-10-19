import { normalizePhone, type Phone } from '@esta/core/phone';
import { describe, expect, it } from 'vitest';
import { fakeDb, HOUSEHOLD } from './test/fake-db';
import { NO_PENDING, viewRows, withWrites, type Write } from './view';

const PROPERTY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0002';
const ROOM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0003';
const PERSON = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0004';

function phone(text: string): Phone {
  const parsed = normalizePhone(text);
  if (!parsed.ok) throw new Error(`${text} is not a phone`);
  return parsed.value;
}

const room: Write = { kind: 'create', table: 'units', row: { id: ROOM, property_id: PROPERTY, label: 'Phòng 2' } };
const lan: Write = { kind: 'create', table: 'parties', row: { id: PERSON, full_name: 'Lan Demo', phone: phone('0901 234 567'), id_last4: '4567' } };

describe('withWrites', () => {
  it('adds each written row under its id and leaves the map it was given as it was', () => {
    const pending = withWrites(NO_PENDING, [room]);
    const next = withWrites(pending, [lan]);
    expect([...pending.keys()]).toEqual([ROOM]);
    expect(next.get(ROOM)).toMatchObject({ table: 'units', row: room.row });
    expect(next.get(PERSON)).toMatchObject({ table: 'parties', row: lan.row });
  });
});

describe('viewRows', () => {
  it("reads only the household's rows, filtered by the lookup", async () => {
    const { db, sent } = fakeDb();
    await viewRows({ db, householdId: HOUSEHOLD }, 'units', { property_id: PROPERTY, label: 'Phòng 2' });
    expect(sent).toMatchObject([{ method: 'GET', table: 'units' }]);
    const filters = Object.fromEntries(sent[0]?.query ?? []);
    expect(filters).toEqual({ select: 'id,property_id,label', household_id: `eq.${HOUSEHOLD}`, property_id: `eq.${PROPERTY}`, label: 'eq.Phòng 2' });
  });

  it('adds the planned rows of the table that match the lookup by id or by natural key', async () => {
    const { db } = fakeDb();
    const ctx = { db, householdId: HOUSEHOLD, pending: withWrites(NO_PENDING, [room, lan]) };
    expect(await viewRows(ctx, 'units', { id: ROOM })).toEqual([room.row]);
    expect(await viewRows(ctx, 'units', { property_id: PROPERTY, label: 'Phòng 2' })).toEqual([room.row]);
    expect(await viewRows(ctx, 'units', { property_id: PROPERTY, label: 'Phòng 3' })).toEqual([]);
    expect(await viewRows(ctx, 'parties', { phone: phone('0901234567') })).toEqual([lan.row]);
    expect(await viewRows(ctx, 'parties', { id_last4: '4567' })).toEqual([lan.row]);
    expect(await viewRows(ctx, 'properties', { id: ROOM })).toEqual([]);
  });

  it('reads the database alone when nothing is pending, as apply and the screens do', async () => {
    const { db } = fakeDb();
    expect(await viewRows({ db, householdId: HOUSEHOLD }, 'units', { id: ROOM })).toEqual([]);
  });

  it('keeps the stored row once a planned row has landed, so it is never read twice', async () => {
    const stored = { id: ROOM, property_id: PROPERTY, label: 'Phòng 2' };
    const { db } = fakeDb((sent) => (sent.table === 'units' ? [stored] : []));
    expect(await viewRows({ db, householdId: HOUSEHOLD, pending: withWrites(NO_PENDING, [room]) }, 'units', { id: ROOM })).toEqual([stored]);
  });

  it('reads a stored phone back as the normalized phone a lookup compares', async () => {
    const { db } = fakeDb(() => [{ id: PERSON, full_name: 'Lan Demo', phone: '+84901234567', id_last4: null }]);
    expect(await viewRows({ db, householdId: HOUSEHOLD }, 'parties', { id: PERSON })).toEqual([{ id: PERSON, full_name: 'Lan Demo', phone: phone('0901 234 567'), id_last4: null }]);
  });
});
