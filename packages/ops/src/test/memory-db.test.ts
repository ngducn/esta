import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { columnsByTable, memoryDb, type Recorded } from './memory-db';

const looseDb = (...args: Parameters<typeof memoryDb>): SupabaseClient => memoryDb(...args);

const rooms = () => [
  { id: 'a', name: 'Phòng 1', rent: 9, seen: '2026-10-01T00:00:00Z', tags: ['x', 'y'], note: null },
  { id: 'b', name: 'Phòng 10', rent: 10, seen: '2026-10-05T00:00:00Z', tags: ['y'], note: 'ok' },
  { id: 'c', name: 'phòng 2', rent: 2, seen: '2026-10-09T00:00:00Z', tags: [], note: 'ok' },
];

describe('memoryDb answers the real client like PostgREST', () => {
  it('filters by type, so 10 is not less than 9 and a null matches no comparison', async () => {
    const db = looseDb({ rooms: rooms() });
    expect((await db.from('rooms').select('id').gte('rent', 9).order('id')).data?.map((r) => r.id)).toEqual(['a', 'b']);
    expect((await db.from('rooms').select('id').neq('note', 'ok')).data).toEqual([]);
    expect((await db.from('rooms').select('id').is('note', null)).data?.map((r) => r.id)).toEqual(['a']);
    expect((await db.from('rooms').select('id').not('note', 'is', null).order('id')).data?.map((r) => r.id)).toEqual(['b', 'c']);
    expect((await db.from('rooms').select('id').gt('seen', '2026-10-05T00:00:00Z')).data?.map((r) => r.id)).toEqual(['c']);
  });

  it('reads like, ilike, in, contains and or the way Postgres does', async () => {
    const db = looseDb({ rooms: rooms() });
    expect((await db.from('rooms').select('id').like('name', 'Phòng 1%').order('id')).data?.map((r) => r.id)).toEqual(['a', 'b']);
    expect((await db.from('rooms').select('id').like('name', 'Phòng _')).data?.map((r) => r.id)).toEqual(['a']);
    expect((await db.from('rooms').select('id').ilike('name', 'PHÒNG 2')).data?.map((r) => r.id)).toEqual(['c']);
    expect((await db.from('rooms').select('id').in('id', ['a', 'c']).order('id')).data?.map((r) => r.id)).toEqual(['a', 'c']);
    expect((await db.from('rooms').select('id').contains('tags', ['y']).order('id')).data?.map((r) => r.id)).toEqual(['a', 'b']);
    expect((await db.from('rooms').select('id').or('rent.eq.2,tags.cs.{x}').order('id')).data?.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('orders numbers as numbers and puts nulls last ascending, first descending', async () => {
    const db = looseDb({ rooms: rooms() });
    expect((await db.from('rooms').select('id').order('rent')).data?.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect((await db.from('rooms').select('id').order('note', { ascending: true })).data?.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect((await db.from('rooms').select('id').order('note', { ascending: false }).order('id')).data?.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('counts before the window, answers head with no rows and refuses a single that is not one row', async () => {
    const db = looseDb({ rooms: rooms() });
    const page = await db.from('rooms').select('id', { count: 'exact' }).order('id').range(1, 1);
    expect(page.data?.map((r) => r.id)).toEqual(['b']);
    expect(page.count).toBe(3);
    const head = await db.from('rooms').select('id', { count: 'exact', head: true }).gte('rent', 9);
    expect(head).toMatchObject({ data: null, count: 2, error: null });
    expect((await db.from('rooms').select('id').single()).error?.code).toBe('PGRST116');
    expect((await db.from('rooms').select('id').eq('id', 'a').single()).data).toEqual({ id: 'a' });
    expect((await db.from('rooms').select('id').maybeSingle()).error?.code).toBe('PGRST116');
    expect((await db.from('rooms').select('id').eq('id', 'zz').maybeSingle()).data).toBeNull();
  });

  it('changes rows in place, records each write and honours on_conflict and ignore-duplicates', async () => {
    const writes: Recorded[] = [];
    const tables = { rooms: rooms() };
    const db = looseDb(tables, writes);
    await db.from('rooms').update({ rent: 11 }).eq('id', 'a');
    expect(tables.rooms[0]?.rent).toBe(11);
    const merged = await db.from('rooms').upsert({ id: 'a', rent: 12 }, { onConflict: 'id' }).select();
    expect(merged.data).toHaveLength(1);
    expect(tables.rooms[0]?.rent).toBe(12);
    const ignored = await db.from('rooms').upsert({ id: 'a', rent: 13 }, { onConflict: 'id', ignoreDuplicates: true }).select();
    expect(ignored.data).toEqual([]);
    expect(tables.rooms[0]?.rent).toBe(12);
    await db.from('rooms').insert({ id: 'd', rent: 1 });
    await db.from('rooms').delete().lt('rent', 2);
    expect(tables.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(writes.map((w) => w.op)).toEqual(['update', 'upsert', 'upsert', 'insert', 'delete']);
    expect(writes.at(-1)?.row).toEqual({ rent: { lt: '2' } });
  });

  it('refuses a write to a refused table and changes nothing, but still reads it', async () => {
    const tables = { rooms: rooms() };
    const db = looseDb(tables, [], {}, { rooms: 'row-level security' });
    expect((await db.from('rooms').update({ rent: 1 }).eq('id', 'a')).error?.message).toBe('row-level security');
    expect((await db.from('rooms').insert({ id: 'z' })).error?.message).toBe('row-level security');
    expect(tables.rooms[0]?.rent).toBe(9);
    expect((await db.from('rooms').select('id')).data).toHaveLength(3);
  });

  it('answers rpc by name, reads Storage from files and refuses what it has no answer for', async () => {
    const db = looseDb({}, [], { 'documents/a.pdf': new Uint8Array([1, 2, 3]) }, {}, { double: (args) => Number(args.n) * 2 });
    expect((await db.rpc('double', { n: 4 })).data).toBe(8);
    expect((await db.rpc('missing')).error?.message).toBe('no fake for missing');
    const found = await db.storage.from('documents').download('a.pdf');
    expect(new Uint8Array((await found.data?.arrayBuffer()) ?? [])).toEqual(new Uint8Array([1, 2, 3]));
    expect((await db.storage.from('documents').download('b.pdf')).error?.message).toBe('b.pdf not found');
  });

  it('fails loudly on a filter it does not read, so a test cannot pass on a guess', async () => {
    const db = looseDb({ rooms: rooms() });
    expect((await db.from('rooms').select('id').textSearch('name', 'x')).error?.message).toMatch(/does not read/);
  });

  it('fails loudly on an embedded select instead of returning plain rows', async () => {
    const db = looseDb({ rooms: rooms() });
    expect((await db.from('rooms').select('id, owner(*)')).error?.message).toMatch(/does not read an embedded/);
    expect((await db.from('rooms').select('id, owner:people(name)')).error?.message).toMatch(/does not read an embedded/);
  });

  it('fails loudly on a column no row has, in the select list, a filter or an order, but not on an empty table', async () => {
    const db = looseDb({ rooms: rooms(), empty: [] });
    expect((await db.from('rooms').select('id, rnet')).error?.message).toBe('column rooms.rnet does not exist');
    expect((await db.from('rooms').select('id').eq('rnet', 9)).error?.message).toBe('column rooms.rnet does not exist');
    expect((await db.from('rooms').select('id').order('rnet')).error?.message).toBe('column rooms.rnet does not exist');
    expect((await db.from('empty').select('id').eq('anything', 1)).error).toBeNull();
  });

  it('knows a real table by its generated columns: a nullable one a fixture leaves out reads as empty, a typo is refused even on an empty table', async () => {
    const db = looseDb({ parties: [{ id: 'p1' }], notifications: [] });
    expect((await db.from('parties').select('id').is('short_name', null)).data).toEqual([{ id: 'p1' }]);
    expect((await db.from('parties').select('id').eq('shortname', 'x')).error?.message).toBe('column parties.shortname does not exist');
    expect((await db.from('notifications').select('id').eq('last_attemp_at', 'x')).error?.message).toBe('column notifications.last_attemp_at does not exist');
  });

  it('parses the generated types: at least the 55 public tables, each with columns, or every table would fall back to row keys', () => {
    const tables = columnsByTable();
    expect(tables.size).toBeGreaterThanOrEqual(55);
    expect(tables.get('parties')?.has('short_name')).toBe(true);
  });
});
