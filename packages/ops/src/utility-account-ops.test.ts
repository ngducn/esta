import { describe, expect, it } from 'vitest';
import { fakeDb, opContext as context, PROPERTY, ROOM } from './test/fake-db';
import { utilityAccountCreate, utilityAccountUpdate } from './utility-account-ops';

const ACCOUNT = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0009';
const electric = { unit_id: null, kind: 'electricity', provider: 'Điện lực Demo', customer_code: 'PE0123456789', holder_name: null, note: null };

describe('utilityAccountCreate', () => {
  const input = utilityAccountCreate.input.parse({ id: ACCOUNT, property_id: PROPERTY, account: electric });
  const properties = (request: { table: string }) => (request.table === 'properties' ? [{ id: PROPERTY, nickname: 'Demo Nhà Q7' }] : []);

  it('refuses an account with nothing to identify it before any read', () => {
    expect(utilityAccountCreate.input.safeParse({ id: ACCOUNT, property_id: PROPERTY, account: { ...electric, provider: null, customer_code: null } }).success).toBe(false);
  });

  it('plans unchanged once its minted id is stored', async () => {
    const { db } = fakeDb((request) => (request.table === 'utility_accounts' ? [{ id: ACCOUNT }] : []));
    expect(await utilityAccountCreate.plan(context(db), input)).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
  });

  it('links only to a live room of the same property', async () => {
    const linked = utilityAccountCreate.input.parse({ id: ACCOUNT, property_id: PROPERTY, account: { ...electric, unit_id: ROOM } });
    const inTrash = fakeDb(properties);
    expect(await utilityAccountCreate.plan(context(inTrash.db), linked)).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'account.unit_id', code: 'not_found' }] } });
    expect(inTrash.sent.find((request) => request.table === 'units')?.query.get('deleted_at')).toBe('is.null');
    const live = fakeDb((request) => (request.table === 'units' ? [{ id: ROOM, property_id: PROPERTY, label: 'Phòng 2' }] : properties(request)));
    expect((await utilityAccountCreate.plan(context(live.db), linked)).ok).toBe(true);
  });
});

describe('utilityAccountUpdate', () => {
  const input = utilityAccountUpdate.input.parse({ id: ACCOUNT, property_id: PROPERTY, account: { ...electric, holder_name: 'Demo Chủ hộ' } });

  it('writes only the columns that differ, from a live account', async () => {
    const { db, sent } = fakeDb(() => [electric]);
    expect(await utilityAccountUpdate.plan(context(db), input)).toEqual({ ok: true, value: { kind: 'change', change: { id: ACCOUNT, set: { holder_name: 'Demo Chủ hộ' } } } });
    expect(sent[0]?.query.get('deleted_at')).toBe('is.null');
  });

  it('plans unchanged for the stored values and not found for an account in the trash', async () => {
    const same = utilityAccountUpdate.input.parse({ id: ACCOUNT, property_id: PROPERTY, account: electric });
    expect(await utilityAccountUpdate.plan(context(fakeDb(() => [electric]).db), same)).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
    expect(await utilityAccountUpdate.plan(context(fakeDb().db), same)).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });
});
