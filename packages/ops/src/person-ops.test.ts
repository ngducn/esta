import { clockAt, parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import type { Db } from './db';
import { personCreate } from './person-ops';
import { fakeDb, type Sent } from './test/fake-db';
import { NO_PENDING, withWrites, type Pending } from './view';

const HOUSEHOLD = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0001';
const LAN = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0005';
const STORED = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0006';

const clock = clockAt({ kind: 'env', now: parseInstant('2026-10-07T02:00:00.000Z') }, 'Asia/Ho_Chi_Minh');
const context = (db: Db, pending?: Pending) => ({ db, householdId: HOUSEHOLD, clock, ...(pending === undefined ? {} : { pending }) });

const parse = (raw: unknown) => {
  const input = personCreate.input.safeParse(raw);
  if (!input.success) throw new Error(`expected the person input to parse: ${input.error.message}`);
  return input.data;
};
const issuePaths = (raw: unknown) => personCreate.input.safeParse(raw).error?.issues.map((issue) => issue.path.join('.'));
const lan = (person: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
  parse({ id: LAN, person: { full_name: 'Phạm Thị Lan Demo', phone: '0912 345 678', id_last4: '4567', ...person }, ...rest });

/** A household holding one person, who answers lookups by phone and by id_last4 as the database would. */
function storedPerson(row: { full_name: string; phone: string | null; id_last4: string | null }) {
  const stored = { id: STORED, ...row };
  const matches = (sent: Sent) => [...sent.query.entries()].every(([key, value]) => key === 'select' || key === 'household_id' || value === `eq.${String(Reflect.get(stored, key))}`);
  return fakeDb((sent) => (sent.table === 'parties' && matches(sent) ? [stored] : [])).db;
}

describe('personCreate input', () => {
  it("takes the lease sheet's name and phone with no ID digits, and normalizes the phone", () => {
    expect(parse({ id: LAN, person: { full_name: ' Lan Demo ', phone: '0912 345 678' } })).toEqual({
      id: LAN,
      person: { full_name: 'Lan Demo', phone: '+84912345678', id_last4: null },
      allow_duplicate: false,
    });
  });

  it('refuses a full ID number, an empty name and a phone that is not one, each at its field', () => {
    expect(issuePaths({ id: LAN, person: { full_name: 'Lan Demo', phone: null, id_last4: '079301004567' } })).toEqual(['person.id_last4']);
    expect(issuePaths({ id: LAN, person: { full_name: ' ', phone: null } })).toEqual(['person.full_name']);
    expect(issuePaths({ id: LAN, person: { full_name: 'Lan Demo', phone: '12' } })).toEqual(['person.phone']);
  });
});

describe('personCreate plan', () => {
  it('plans an individual tagged tenant with the name in NFC and the phone normalized', async () => {
    const decomposed = 'Phạm Thị Lan Demo'.normalize('NFD');
    const planned = await personCreate.plan(context(fakeDb().db), lan({ full_name: decomposed }));
    expect(planned).toEqual({
      ok: true,
      value: { kind: 'change', change: { id: LAN, row: { kind: 'individual', full_name: 'Phạm Thị Lan Demo', phone: '+84912345678', id_last4: '4567', tags: ['tenant'] } } },
    });
  });

  it('refuses a stored person with the same phone as a possible duplicate, naming them', async () => {
    const db = storedPerson({ full_name: 'Nguyễn Văn An Demo', phone: '+84912345678', id_last4: null });
    expect(await personCreate.plan(context(db), lan())).toEqual({
      ok: false,
      reason: { kind: 'possible_duplicate', people: [{ id: STORED, full_name: 'Nguyễn Văn An Demo', phone: '+84912345678', id_last4: null, reasons: ['phone'] }] },
    });
  });

  it('refuses the same name and last four ID digits, whatever the accents and case', async () => {
    const db = storedPerson({ full_name: 'PHAM THI LAN DEMO', phone: null, id_last4: '4567' });
    expect(await personCreate.plan(context(db), lan())).toMatchObject({ ok: false, reason: { people: [{ id: STORED, reasons: ['name_and_id_last4'] }] } });
  });

  it('gives both reasons when the phone and the name with the ID digits match', async () => {
    const db = storedPerson({ full_name: 'Phạm Thị Lan Demo', phone: '+84912345678', id_last4: '4567' });
    expect(await personCreate.plan(context(db), lan())).toMatchObject({ ok: false, reason: { people: [{ id: STORED, reasons: ['phone', 'name_and_id_last4'] }] } });
  });

  it('plans someone else with the same last four ID digits', async () => {
    const db = storedPerson({ full_name: 'Trần Thị Bình Demo', phone: null, id_last4: '4567' });
    expect(await personCreate.plan(context(db), lan())).toMatchObject({ ok: true, value: { kind: 'change' } });
  });

  it('refuses a person planned earlier in the same batch with the same phone', async () => {
    const pending = withWrites(NO_PENDING, [{ kind: 'create', table: 'parties', row: { id: STORED, full_name: 'Lan Demo', phone: lan().person.phone, id_last4: null } }]);
    expect(await personCreate.plan(context(fakeDb().db, pending), lan())).toMatchObject({ ok: false, reason: { kind: 'possible_duplicate', people: [{ id: STORED, reasons: ['phone'] }] } });
  });

  it('plans the person when Ryan said it is someone else', async () => {
    const db = storedPerson({ full_name: 'Phạm Thị Lan Demo', phone: '+84912345678', id_last4: '4567' });
    expect(await personCreate.plan(context(db), lan({}, { allow_duplicate: true }))).toMatchObject({ ok: true, value: { kind: 'change' } });
  });

  it('plans unchanged once its minted id is stored, so a landed person never matches itself', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'parties' ? [{ id: LAN, full_name: 'Phạm Thị Lan Demo', phone: '+84912345678', id_last4: '4567' }] : []));
    expect(await personCreate.plan(context(db), lan())).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: LAN, full_name: 'Phạm Thị Lan Demo', phone: '+84912345678' } } });
    expect(sent).toHaveLength(1);
  });

  it('declares the row a later item reads before it lands', async () => {
    const planned = await personCreate.plan(context(fakeDb().db), lan());
    if (!planned.ok || planned.value.kind !== 'change') throw new Error('expected a change');
    expect(personCreate.writes?.(planned.value.change)).toEqual([
      { kind: 'create', table: 'parties', row: { id: LAN, full_name: 'Phạm Thị Lan Demo', phone: '+84912345678', id_last4: '4567' } },
    ]);
  });
});
