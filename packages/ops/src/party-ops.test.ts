import { describe, expect, it } from 'vitest';
import { fakeDb, opContext, TENANT, type Sent } from './test/fake-db';
import { partyRedact } from './party-ops';

const party = (full_name = 'Chị Lan Demo') => ({ id: TENANT, full_name, phone: null, id_last4: null });
const NAMES = ['h/doc-1/front.jpg', 'h/doc-1/thumb.webp', 'h/doc-2/back.jpg'];

function world({ name = 'Chị Lan Demo', cards = 0, removed = NAMES, rpc = NAMES, raised, removes = [1] }: { name?: string; cards?: number; removed?: string[]; rpc?: string[]; raised?: string; removes?: number[] } = {}) {
  let removeCalls = 0;
  const answer = (request: Sent): readonly unknown[] => {
    if (request.table === 'parties') return [party(name)];
    if (request.table === 'documents') return Array.from({ length: cards }, () => ({}));
    if (request.table === 'rpc/redact_party') return rpc;
    if (request.table.startsWith('/storage/v1/object/documents')) return removes[Math.min(removeCalls++, removes.length - 1)] === 1 ? removed.map((n) => ({ name: n })) : [];
    return [];
  };
  const failure = (request: Sent) => (raised !== undefined && request.table === 'rpc/redact_party' ? { code: raised === 'forbidden' ? '42501' : 'ES002', message: raised } : null);
  return fakeDb(answer, failure);
}

describe('partyRedact', () => {
  it('plans a change for a person who is still named, and nothing for one already erased with no ID card left', async () => {
    const ctx = opContext(world().db);
    expect(await partyRedact.plan(ctx, { id: TENANT })).toEqual({ ok: true, value: { kind: 'change', change: { id: TENANT } } });
    expect(await partyRedact.plan(opContext(world({ name: 'Đã xóa' }).db), { id: TENANT })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
  });

  it('plans again for an erased person who has a new ID card on file', async () => {
    const planned = await partyRedact.plan(opContext(world({ name: 'Đã xóa', cards: 1 }).db), { id: TENANT });
    expect(planned).toMatchObject({ ok: true, value: { kind: 'change' } });
  });

  it('refuses a person the household does not have', async () => {
    const { db } = fakeDb(() => []);
    expect(await partyRedact.plan(opContext(db), { id: TENANT })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('asks the database with the Clock\'s business date and removes the files it names', async () => {
    const { db, sent } = world();
    const applied = await partyRedact.apply(opContext(db), { id: TENANT });
    expect(applied).toEqual({ ok: true, value: { id: TENANT, removedFiles: 3 } });
    expect(sent.find((request) => request.table === 'rpc/redact_party')?.body).toEqual({ p_party_id: TENANT, p_as_of: '2026-10-07' });
    expect(sent.some((request) => request.table.startsWith('/storage/v1/object/documents'))).toBe(true);
  });

  it('turns the two ES002 refusals into kinds a screen reads, and removes no file', async () => {
    for (const [message, kind] of [['ESTA_PARTY_ACTIVE_LEASE', 'active_lease'], ['ESTA_PARTY_DEPOSIT_HELD', 'deposit_held']] as const) {
      const { db, sent } = world({ raised: message });
      expect(await partyRedact.apply(opContext(db), { id: TENANT })).toEqual({ ok: false, reason: { kind } });
      expect(sent.some((request) => request.table.startsWith('/storage/'))).toBe(false);
    }
  });

  it('maps a caller who is not an admin to forbidden', async () => {
    expect(await partyRedact.apply(opContext(world({ raised: 'forbidden' }).db), { id: TENANT })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });

  it('tries the removal again, and says files are left when it still fails', async () => {
    const retried = world({ removes: [0, 0, 1] });
    expect(await partyRedact.apply(opContext(retried.db), { id: TENANT })).toMatchObject({ ok: true });
    const failing = world({ removes: [0] });
    expect(await partyRedact.apply(opContext(failing.db), { id: TENANT })).toEqual({ ok: false, reason: { kind: 'files_left' } });
    expect(failing.sent.filter((request) => request.table.startsWith('/storage/v1/object/documents'))).toHaveLength(3);
  });

  it('has no files to remove when the person held no ID card', async () => {
    const { db, sent } = world({ rpc: [] });
    expect(await partyRedact.apply(opContext(db), { id: TENANT })).toEqual({ ok: true, value: { id: TENANT, removedFiles: 0 } });
    expect(sent.some((request) => request.table.startsWith('/storage/'))).toBe(false);
  });
});
