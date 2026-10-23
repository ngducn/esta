import { describe, expect, it } from 'vitest';
import { batchUndo } from './batch-undo';
import { runOp } from './op';
import { fakeDb, opContext } from './test/fake-db';

const BATCH = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0011';

describe('batchUndo', () => {
  it('refuses a batch already undone as not undoable, without calling the undo', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'change_batches' ? [{ status: 'undone' }] : []));
    expect(await runOp(batchUndo, opContext(db), { batch_id: BATCH })).toEqual({ ok: false, reason: { kind: 'not_undoable', status: 'undone' } });
    expect(sent.map((request) => request.table)).toEqual(['change_batches']);
  });

  it('refuses as undone when another undo finished between the read and the undo', async () => {
    const { db } = fakeDb(
      (request) => (request.table === 'change_batches' ? [{ status: 'applied' }] : []),
      (request) => (request.table === 'rpc/undo_change_batch' ? { message: 'ESTA_BATCH_NOT_UNDOABLE', code: '55000', details: 'undone', hint: null } : null),
    );
    expect(await runOp(batchUndo, opContext(db), { batch_id: BATCH })).toEqual({ ok: false, reason: { kind: 'not_undoable', status: 'undone' } });
  });
});
