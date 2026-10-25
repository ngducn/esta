import { describe, expect, it } from 'vitest';
import { agentItemSetStatus, agentJobRetry } from './agent-item-ops';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const ITEM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0a10';

const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');
const stored = (status: string) => (request: Sent) => (request.table === 'agent_items' ? [{ status, id: ITEM }] : []);

describe('agentItemSetStatus', () => {
  it('takes new, read and dismissed only, so the inbox can never mark an item approved or done', () => {
    for (const status of ['new', 'read', 'dismissed']) expect(agentItemSetStatus.input.safeParse({ id: ITEM, status }).success).toBe(true);
    for (const status of ['approved', 'done', 'failed']) expect(agentItemSetStatus.input.safeParse({ id: ITEM, status }).success).toBe(false);
  });

  it('writes the status of the household item, guarded to statuses the inbox owns', async () => {
    const { db, sent } = fakeDb(stored('new'));
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'read' })).toEqual({ ok: true, value: { id: ITEM } });
    const [update] = writes(sent);
    expect(update?.method).toBe('PATCH');
    expect(update?.body).toEqual({ status: 'read' });
    expect(update?.query.get('household_id')).toBe(`eq.${HOUSEHOLD}`);
    expect(update?.query.get('id')).toBe(`eq.${ITEM}`);
    expect(update?.query.get('status')).toBe('in.(new,read,dismissed)');
  });

  it('writes nothing when the item already has the status, so a second tap is a no-op', async () => {
    const { db, sent } = fakeDb(stored('dismissed'));
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'dismissed' })).toEqual({ ok: true, value: { id: ITEM } });
    expect(writes(sent)).toEqual([]);
  });

  it('puts a hidden note back as unread, which is what Hoàn tác sends', async () => {
    const { db, sent } = fakeDb(stored('dismissed'));
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'new' })).toEqual({ ok: true, value: { id: ITEM } });
    expect(writes(sent).map((request) => request.body)).toEqual([{ status: 'new' }]);
  });

  it.each(['done', 'approved', 'failed'])('never reopens an item that is %s', async (status) => {
    const { db, sent } = fakeDb(stored(status));
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'new' })).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'status', code: 'decided' }] } });
    expect(writes(sent)).toEqual([]);
  });

  it('refuses an item it cannot see, as an operator note is to a member', async () => {
    const { db, sent } = fakeDb();
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'read' })).toEqual({ ok: false, reason: { kind: 'not_found' } });
    expect(writes(sent)).toEqual([]);
  });

  it('is forbidden when the update touched no row and the note is still open, as for a viewer', async () => {
    const { db } = fakeDb((request) => (request.method === 'GET' ? stored('new')(request) : []));
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'read' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });

  it('explains an item marked done between the plan and the write instead of reopening it', async () => {
    let reads = 0;
    const { db } = fakeDb((request) => {
      if (request.method !== 'GET') return [];
      reads += 1;
      return stored(reads === 1 ? 'new' : 'done')(request);
    });
    expect(await runOp(agentItemSetStatus, context(db), { id: ITEM, status: 'read' })).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'status', code: 'decided' }] } });
  });
});

describe('agentJobRetry', () => {
  const rpcs = (sent: readonly Sent[]) => sent.filter((request) => request.table.startsWith('rpc/'));

  it.each(['new', 'read'])('sends Thử lại on a %s item to retry_agent_job', async (status) => {
    const { db, sent } = fakeDb(stored(status));
    expect(await runOp(agentJobRetry, context(db), { id: ITEM })).toEqual({ ok: true, value: { id: ITEM } });
    expect(rpcs(sent)).toMatchObject([{ method: 'POST', table: 'rpc/retry_agent_job', body: { p_item_id: ITEM } }]);
  });

  it('calls nothing for an item already retried, so a second tap is a no-op', async () => {
    const { db, sent } = fakeDb(stored('done'));
    expect(await runOp(agentJobRetry, context(db), { id: ITEM })).toEqual({ ok: true, value: { id: ITEM } });
    expect(rpcs(sent)).toEqual([]);
  });

  it('refuses a hidden item and one it cannot see', async () => {
    expect(await runOp(agentJobRetry, context(fakeDb(stored('dismissed')).db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'conflict' } });
    expect(await runOp(agentJobRetry, context(fakeDb().db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it("maps the function's refusals: not an admin, and a job that did not fail", async () => {
    const failing = (error: { code: string; message: string }) => fakeDb(stored('new'), (request) => (request.table.startsWith('rpc/') ? error : null));
    expect(await runOp(agentJobRetry, context(failing({ code: 'P0002', message: 'ESTA_RETRY_NOT_FOUND' }).db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'not_found' } });
    expect(await runOp(agentJobRetry, context(failing({ code: '55000', message: 'ESTA_RETRY_NOT_FAILED' }).db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'conflict' } });
  });
});
