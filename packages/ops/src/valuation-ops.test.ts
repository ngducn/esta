import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, PROPERTY, trashedProperty, type Sent } from './test/fake-db';
import { valuationCreate, valuationDelete } from './valuation-ops';

const VALUATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0f20';
const quote = {
  id: VALUATION,
  propertyId: PROPERTY,
  asOf: '2026-10-07',
  valueVnd: 9_500_000_000,
  method: 'broker_quote',
  sourceUrl: 'https://example.com/bao-gia',
  note: null,
};

const live = (sent: Sent): readonly unknown[] => (sent.table === 'properties' ? [{ id: PROPERTY, nickname: 'Đất Bảo Lộc Demo' }] : []);
const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');

describe('valuationCreate', () => {
  it('takes a stored valuation as the sheet sends it once read, and refuses an http: source', () => {
    expect(valuationCreate.input.safeParse(quote).success).toBe(true);
    expect(valuationCreate.input.safeParse({ ...quote, sourceUrl: 'http://example.com' }).success).toBe(false);
  });

  it('inserts the row under the minted id in the household', async () => {
    const { db, sent } = fakeDb(live);
    expect(await runOp(valuationCreate, context(db), quote)).toEqual({ ok: true, value: { id: VALUATION } });
    expect(writes(sent).map((request) => request.body)).toEqual([
      {
        id: VALUATION,
        household_id: HOUSEHOLD,
        property_id: PROPERTY,
        as_of: '2026-10-07',
        value_vnd: 9_500_000_000,
        method: 'broker_quote',
        source_url: 'https://example.com/bao-gia',
        note: null,
      },
    ]);
  });

  it('writes nothing again once its id is stored, so a retry or a second tap records one valuation', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'valuations' ? [{ id: VALUATION }] : live(request)));
    expect(await runOp(valuationCreate, context(db), quote)).toEqual({ ok: true, value: { id: VALUATION } });
    expect(writes(sent)).toEqual([]);
  });

  it('refuses a property in the trash', async () => {
    const { db, sent } = fakeDb(trashedProperty());
    expect(await runOp(valuationCreate, context(db), quote)).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'propertyId', code: 'not_found' }] } });
    expect(writes(sent)).toEqual([]);
  });

  it('reads a refusal by row level security as forbidden', async () => {
    const { db } = fakeDb(live, (request) => (request.method === 'POST' ? { code: '42501', message: 'new row violates row-level security policy' } : null));
    expect(await runOp(valuationCreate, context(db), quote)).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});

describe('valuationDelete', () => {
  it('deletes the stored valuation of the household', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'valuations' ? [{ id: VALUATION }] : []));
    expect(await runOp(valuationDelete, context(db), { id: VALUATION })).toEqual({ ok: true, value: { id: VALUATION } });
    const [removed] = writes(sent);
    expect(removed?.method).toBe('DELETE');
    expect(removed?.query.get('household_id')).toBe(`eq.${HOUSEHOLD}`);
    expect(removed?.query.get('id')).toBe(`eq.${VALUATION}`);
  });

  it('is done already when the valuation is gone, so a second tap deletes nothing', async () => {
    const { db, sent } = fakeDb();
    expect(await runOp(valuationDelete, context(db), { id: VALUATION })).toEqual({ ok: true, value: { id: VALUATION } });
    expect(writes(sent)).toEqual([]);
  });

  it('is forbidden when the delete touched no row and the valuation is still there, as for a viewer', async () => {
    const { db } = fakeDb((request) => (request.table === 'valuations' && request.method === 'GET' ? [{ id: VALUATION }] : []));
    expect(await runOp(valuationDelete, context(db), { id: VALUATION })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});
