import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { taskSetStatus } from './task-ops';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const TASK = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0a30';
const holding = (status: string) => (sent: Sent) => (sent.table === 'tasks' ? [{ status, id: TASK }] : []);
const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');

describe('taskSetStatus', () => {
  it('marks an open task of the household done, and undo opens it again', async () => {
    const done = fakeDb(holding('open'));
    expect(await runOp(taskSetStatus, context(done.db), { id: TASK, status: 'done' })).toEqual({ ok: true, value: { id: TASK } });
    expect(writes(done.sent)).toMatchObject([{ method: 'PATCH', table: 'tasks', body: { status: 'done' } }]);
    expect(writes(done.sent)[0]?.query.get('household_id')).toBe(`eq.${HOUSEHOLD}`);
    const undo = fakeDb(holding('done'));
    expect(await runOp(taskSetStatus, context(undo.db), { id: TASK, status: 'open' })).toEqual({ ok: true, value: { id: TASK } });
  });

  it('writes nothing for a second tap, and refuses a task it cannot see or a status it does not set', async () => {
    const again = fakeDb(holding('done'));
    expect(await runOp(taskSetStatus, context(again.db), { id: TASK, status: 'done' })).toEqual({ ok: true, value: { id: TASK } });
    expect(writes(again.sent)).toEqual([]);
    expect(await runOp(taskSetStatus, context(fakeDb().db), { id: TASK, status: 'done' })).toEqual({ ok: false, reason: { kind: 'not_found' } });
    expect(taskSetStatus.input.safeParse({ id: TASK, status: 'dismissed' }).success).toBe(false);
  });

  it('is forbidden when the update touched no row, as for a viewer', async () => {
    const { db } = fakeDb((sent) => (sent.method === 'GET' ? holding('open')(sent) : []));
    expect(await runOp(taskSetStatus, context(db), { id: TASK, status: 'done' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});
