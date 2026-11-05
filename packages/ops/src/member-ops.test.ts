import { describe, expect, it } from 'vitest';
import { householdRename, memberInvite, memberRemove, memberSetRole } from './member-ops';
import { runOp } from './op';
import { fakeDb, opContext as context, type Sent } from './test/fake-db';

const MEMBER = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0030';
const members = (row: object | null) => (sent: Sent) => (sent.table === 'household_members' && sent.method === 'GET' && row !== null ? [row] : []);

describe('memberInvite', () => {
  it('names the role and lowercases the email', () => {
    expect(memberInvite.input.parse({ email: ' Co.Demo@Demo.Esta.Test ', role: 'viewer' })).toEqual({ email: 'co.demo@demo.esta.test', role: 'viewer' });
    expect(memberInvite.input.safeParse({ email: 'co.demo@demo.esta.test', role: 'owner' }).success).toBe(false);
  });

  it('asks invite_member for exactly the role named', async () => {
    const { db, sent } = fakeDb(members(null));
    const input = memberInvite.input.parse({ email: 'co.demo@demo.esta.test', role: 'viewer' });
    await memberInvite.apply(context(db), input);
    expect(sent.at(-1)).toMatchObject({ method: 'POST', table: 'rpc/invite_member', body: { p_email: 'co.demo@demo.esta.test', p_role: 'viewer' } });
  });

  it('plans the same pending invite as unchanged and refuses a different role or a signed-in member', async () => {
    const input = memberInvite.input.parse({ email: 'co.demo@demo.esta.test', role: 'viewer' });
    const pending = { id: MEMBER, role: 'viewer', user_id: null };
    expect(await memberInvite.plan(context(fakeDb(members(pending)).db), input)).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: MEMBER } } });
    expect(await memberInvite.plan(context(fakeDb(members({ ...pending, role: 'member' })).db), input)).toEqual({ ok: false, reason: { kind: 'already_invited' } });
    expect(await memberInvite.plan(context(fakeDb(members({ ...pending, user_id: MEMBER })).db), input)).toEqual({ ok: false, reason: { kind: 'already_member' } });
  });

  it('refuses a non-admin as the database does', async () => {
    const { db } = fakeDb(members(null), (sent) => (sent.table === 'rpc/invite_member' ? { code: '42501', message: 'only an admin of the household can invite' } : null));
    expect(await runOp(memberInvite, context(db), { email: 'co.demo@demo.esta.test', role: 'viewer' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});

describe('memberSetRole and memberRemove', () => {
  const stored = { id: MEMBER, role: 'admin', user_id: MEMBER };

  it('reads the last-admin guard as last_admin', async () => {
    const { db } = fakeDb(members(stored), (sent) => (sent.method === 'PATCH' ? { code: '23514', message: 'a household keeps at least one admin who has signed in' } : null));
    expect(await runOp(memberSetRole, context(db), { id: MEMBER, role: 'member' })).toEqual({ ok: false, reason: { kind: 'last_admin' } });
    const removal = fakeDb(members(stored), (sent) => (sent.method === 'DELETE' ? { code: '23514', message: 'a household keeps at least one admin who has signed in' } : null));
    expect(await runOp(memberRemove, context(removal.db), { id: MEMBER })).toEqual({ ok: false, reason: { kind: 'last_admin' } });
  });

  it('reads the operator guard as operator', async () => {
    const { db } = fakeDb(members(stored), (sent) => (sent.method === 'PATCH' ? { code: '42501', message: 'only an operator of the household can change or remove an operator' } : null));
    expect(await runOp(memberSetRole, context(db), { id: MEMBER, role: 'member' })).toEqual({ ok: false, reason: { kind: 'operator' } });
  });

  it('reads the operator keeping its own row as operator', async () => {
    const { db } = fakeDb(members(stored), (sent) => (sent.method === 'PATCH' || sent.method === 'DELETE' ? { code: '42501', message: 'the operator keeps the admin role and the row' } : null));
    expect(await runOp(memberSetRole, context(db), { id: MEMBER, role: 'viewer' })).toEqual({ ok: false, reason: { kind: 'operator' } });
    expect(await runOp(memberRemove, context(db), { id: MEMBER })).toEqual({ ok: false, reason: { kind: 'operator' } });
  });

  it('answers forbidden when RLS hides the write and not_found when the member is gone', async () => {
    const hidden = fakeDb((sent) => (sent.method === 'GET' ? [stored] : []));
    expect(await runOp(memberSetRole, context(hidden.db), { id: MEMBER, role: 'viewer' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
    expect(await runOp(memberRemove, context(hidden.db), { id: MEMBER })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
    expect(await runOp(memberSetRole, context(fakeDb().db), { id: MEMBER, role: 'viewer' })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('plans a role already held and a member already gone as unchanged', async () => {
    expect(await memberSetRole.plan(context(fakeDb(members(stored)).db), { id: MEMBER, role: 'admin' })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
    expect(await memberRemove.plan(context(fakeDb().db), { id: MEMBER })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
  });
});

describe('householdRename', () => {
  it('trims the name and plans the same name as unchanged', async () => {
    expect(householdRename.input.parse({ name: '  Gia đình Demo  ' })).toEqual({ name: 'Gia đình Demo' });
    expect(await householdRename.plan(context(fakeDb(() => [{ name: 'Gia đình Demo' }]).db), { name: 'Gia đình Demo' })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
  });

  it('reads a rename RLS wrote nothing for as forbidden', async () => {
    expect(await householdRename.apply(context(fakeDb().db), { name: 'Gia đình Demo' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});
