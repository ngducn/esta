import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeDb, opContext, ROOM } from './test/fake-db';
import { SOFT_DELETE_TABLES, softDeleteOps } from './soft-delete';

const MIGRATIONS = join(import.meta.dirname, '../../../supabase/migrations');

describe('SOFT_DELETE_TABLES', () => {
  const sql = readdirSync(MIGRATIONS).map((file) => readFileSync(join(MIGRATIONS, file), 'utf8')).join('\n');

  it.each(SOFT_DELETE_TABLES)('%s calls enable_soft_delete, so a user delete touches no row and undo is a restore by id', (table) => {
    expect(sql).toContain(`private.enable_soft_delete('public.${table}')`);
  });
});

describe('softDeleteOps', () => {
  const { remove, restore } = softDeleteOps('units', { ESTA_UNIT_HAS_LEASES: { kind: 'unit_has_leases' } });
  const stored = (deleted_at: string | null) => () => [{ id: ROOM, deleted_at }];

  it('plans a change for a live room and unchanged for one already in the trash', async () => {
    expect(await remove.plan(opContext(fakeDb(stored(null)).db), { id: ROOM })).toEqual({ ok: true, value: { kind: 'change', change: { id: ROOM } } });
    expect(await remove.plan(opContext(fakeDb(stored('2026-10-07T00:00:00Z')).db), { id: ROOM })).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ROOM } } });
  });

  it('restores only a row that is in the trash', async () => {
    expect(await restore.plan(opContext(fakeDb(stored('2026-10-07T00:00:00Z')).db), { id: ROOM })).toEqual({ ok: true, value: { kind: 'change', change: { id: ROOM } } });
    expect(await restore.plan(opContext(fakeDb(stored(null)).db), { id: ROOM })).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ROOM } } });
  });

  it('reports a row that is not there', async () => {
    expect(await remove.plan(opContext(fakeDb(() => []).db), { id: ROOM })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('stamps the Clock on delete and clears the stamp on restore, in one update of the same row', async () => {
    const trashed = fakeDb(() => [{ id: ROOM }]);
    expect(await remove.apply(opContext(trashed.db), { id: ROOM })).toEqual({ ok: true, value: { id: ROOM } });
    expect(trashed.sent).toMatchObject([{ method: 'PATCH', table: 'units', body: { deleted_at: '2026-10-07T02:00:00.000Z' } }]);
    const back = fakeDb(() => [{ id: ROOM }]);
    await restore.apply(opContext(back.db), { id: ROOM });
    expect(back.sent).toMatchObject([{ method: 'PATCH', table: 'units', body: { deleted_at: null } }]);
  });

  it('names the table\'s own refusal when its trigger raises one', async () => {
    const refused = fakeDb(() => [], () => ({ code: '23503', message: 'ESTA_UNIT_HAS_LEASES' }));
    expect(await remove.apply(opContext(refused.db), { id: ROOM })).toEqual({ ok: false, reason: { kind: 'unit_has_leases' } });
  });
});
