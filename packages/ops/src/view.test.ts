import { isoDate } from '@esta/core/date';
import { normalizePhone, type Phone } from '@esta/core/phone';
import { describe, expect, it } from 'vitest';
import { fakeDb, HOUSEHOLD, LEASE, storedLease, viewLease } from './test/fake-db';
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

  it('reads a phone stored some other way as it is, rather than failing the read', async () => {
    const row = { id: PERSON, full_name: 'Lan Demo', phone: 'Zalo 0901', id_last4: null };
    const { db } = fakeDb(() => [row]);
    expect(await viewRows({ db, householdId: HOUSEHOLD }, 'parties', { id: PERSON })).toEqual([row]);
  });
});

describe('viewRows of leases', () => {
  const activation: Write = { kind: 'set', table: 'leases', id: LEASE, set: { status: 'active', paid_through_date: isoDate('2026-09-30') } };

  it('reads a stored lease by id in the household and lays a planned activation over it', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'leases' ? [storedLease()] : []));
    const [lease] = await viewRows({ db, householdId: HOUSEHOLD, pending: withWrites(NO_PENDING, [activation]) }, 'leases', { id: LEASE });
    expect(lease).toMatchObject({ id: LEASE, rent_vnd: 9_000_000, status: 'active', paid_through_date: '2026-09-30' });
    expect(Object.fromEntries(sent[0]?.query ?? [])).toMatchObject({ household_id: `eq.${HOUSEHOLD}`, id: `eq.${LEASE}` });
  });

  it('merges a set into a lease planned earlier in the batch, and reads it as stored once nothing is pending', async () => {
    const { db } = fakeDb();
    const created: Write = { kind: 'create', table: 'leases', row: viewLease() };
    const pending = withWrites(withWrites(NO_PENDING, [created]), [activation]);
    expect(await viewRows({ db, householdId: HOUSEHOLD, pending }, 'leases', { id: LEASE })).toMatchObject([{ id: LEASE, status: 'active', paid_through_date: '2026-09-30' }]);
    expect(await viewRows({ db, householdId: HOUSEHOLD }, 'leases', { id: LEASE })).toEqual([]);
  });

  it('keeps a set on a stored lease out of reads of other tables', async () => {
    const { db } = fakeDb();
    expect(await viewRows({ db, householdId: HOUSEHOLD, pending: withWrites(NO_PENDING, [activation]) }, 'units', { id: LEASE })).toEqual([]);
  });
});
