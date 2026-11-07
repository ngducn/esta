import { formatVnd } from '@esta/core/format';
import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, PROPERTY, trashedProperty, type Sent } from './test/fake-db';
import { valuationCreate, valuationDelete, valuationRecord } from './valuation-ops';

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

  it.each([
    [true, { ok: true, value: { id: VALUATION } }],
    [false, { ok: false, reason: { kind: 'conflict' } }],
  ])('when a second tap loses the insert race to the first (first one stored: %s), it answers %j', async (firstStored, answer) => {
    let inserted = false;
    const { db } = fakeDb(
      (request) => (request.table === 'valuations' ? (inserted && firstStored ? [{ id: VALUATION }] : []) : live(request)),
      (request) => {
        if (request.table !== 'valuations' || request.method !== 'POST') return null;
        inserted = true;
        return { code: '23505', message: 'duplicate key value violates unique constraint "valuations_pkey"' };
      },
    );
    expect(await runOp(valuationCreate, context(db), quote)).toEqual(answer);
  });

  it('refuses a valuation dated after the Clock day, whoever calls it', async () => {
    const { db, sent } = fakeDb(live);
    expect(await runOp(valuationCreate, context(db), { ...quote, asOf: '2026-10-08' })).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'asOf', code: 'after_today' }] } });
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

describe('valuationRecord', () => {
  const sent = { id: VALUATION, property_id: PROPERTY, as_of: '2026-10-07', value_vnd: 9_500_000_000, method: 'owner_estimate' };
  const parsed = (raw: unknown) => valuationRecord.input.safeParse(raw);
  const issuePaths = (raw: unknown) => parsed(raw).error?.issues.map((issue) => issue.path.join('.'));

  it('reads what Claude sends in snake_case, with the source and the note left out as null', () => {
    expect(parsed(sent).data).toEqual({ id: VALUATION, propertyId: PROPERTY, asOf: '2026-10-07', valueVnd: 9_500_000_000, method: 'owner_estimate', sourceUrl: null, note: null });
    expect(parsed({ ...sent, source_url: 'https://example.com/bao-gia', note: 'Demo: giá Ryan ước' }).data).toMatchObject({ sourceUrl: 'https://example.com/bao-gia', note: 'Demo: giá Ryan ước' });
  });

  it.each([
    ['a value with a fraction of a đồng', { value_vnd: 1.5 }, 'value_vnd'],
    ['a value of nothing', { value_vnd: 0 }, 'value_vnd'],
    ['a method Esta does not know', { method: 'guess' }, 'method'],
    ['a source that is not https', { source_url: 'http://example.com' }, 'source_url'],
    ['a date that is not a day', { as_of: '2026-13-40' }, 'as_of'],
    ['a key the sheet uses', { propertyId: PROPERTY }, ''],
  ])('refuses %s, naming the key Claude sent', (_name, set, path) => {
    expect(issuePaths({ ...sent, ...set })).toEqual([path]);
  });

  it('plans the row the sheet would save, and nothing else', async () => {
    const { db, sent: requests } = fakeDb(live);
    const valuation = parsed(sent).data;
    if (valuation === undefined) throw new Error('expected the input to parse');
    expect(await valuationRecord.plan(context(db), valuation)).toEqual({ ok: true, value: { kind: 'change', change: valuation } });
    expect(writes(requests)).toEqual([]);
  });

  it('plans unchanged for a valuation id already stored', async () => {
    const valuation = parsed(sent).data;
    if (valuation === undefined) throw new Error('expected the input to parse');
    const { db } = fakeDb((request) => (request.table === 'valuations' ? [{ id: VALUATION }] : live(request)));
    expect(await valuationRecord.plan(context(db), valuation)).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: VALUATION } } });
  });

  it.each([
    ['dated after today', { as_of: '2026-10-08' }, live, 'as_of', 'after_today'],
    ['for a property the operator cannot see (another household reads as missing under RLS)', {}, () => [], 'property_id', 'not_found'],
    ['for a property in the trash', {}, trashedProperty(), 'property_id', 'not_found'],
  ])('refuses a valuation %s, at the key Claude sent', async (_name, set, rows, path, code) => {
    const valuation = parsed({ ...sent, ...set }).data;
    if (valuation === undefined) throw new Error('expected the input to parse');
    const { db } = fakeDb(rows);
    expect(await valuationRecord.plan(context(db), valuation)).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path, code }] } });
  });

  it('shows the property, the value and the day for Ryan to read', async () => {
    const valuation = parsed(sent).data;
    if (valuation === undefined) throw new Error('expected the input to parse');
    expect(await valuationRecord.preview?.(context(fakeDb(live).db), valuation)).toEqual({ property: 'Đất Bảo Lộc Demo', value_display: formatVnd(valuation.valueVnd, 'vi'), as_of_display: '07/10/2026' });
  });
});
