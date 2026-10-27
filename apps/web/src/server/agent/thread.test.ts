import { describe, expect, it, vi } from 'vitest';
import { canonicalStamp, parseCursor, windowFilter } from './thread-cursor';

const HOUSEHOLD = '0943e55d-b0a6-5aef-839d-07c8693c520e';
type Row = Record<string, unknown> & { id: string; created_at: string };
const stored = vi.hoisted(() => ({ agent_items: [] as Row[], messages: [] as Row[] }));

function matches(row: Row, filter: string): boolean {
  const test = (field: string, op: string, value: string) => {
    const left = field === 'created_at' ? canonicalStamp(row.created_at) : String(row[field]);
    return { eq: left === value, lt: left < value, lte: left <= value, gt: left > value, gte: left >= value }[op] ?? false;
  };
  const terms = filter.match(/and\([^)]*\)|[^,]+/g) ?? [];
  return terms.some((term) =>
    term
      .replace(/^and\((.*)\)$/, '$1')
      .split(',')
      .every((part) => {
        const [, field = '', op = '', value = ''] = /^(\w+)\.(\w+)\.(.*)$/.exec(part) ?? [];
        return test(field, op, value.replace(/^"(.*)"$/, '$1'));
      }),
  );
}

/**
 * A PostgREST builder over `stored`, as RLS has already narrowed it to what the member reads. These tests prove what
 * loadThread does with the rows she reads; pgTAP proves which rows those are: no operator item
 * (supabase/tests/agent_items.test.sql) and only her own messages and their history (thread.test.sql, thread_rules.test.sql).
 */
function from(table: 'agent_items' | 'messages') {
  let rows = [...stored[table]];
  let ascending = false;
  const builder = {
    select: () => builder,
    eq: (field: string, value: unknown) => ((rows = rows.filter((row) => field === 'household_id' || row[field] === value)), builder),
    in: (field: string, values: readonly unknown[]) => ((rows = rows.filter((row) => values.includes(row[field]))), builder),
    not: (field: string, op: 'in', list: string) => ((rows = rows.filter((row) => !list.slice(1, -1).split(',').includes(String(row[field])))), builder),
    or: (filter: string) => ((rows = rows.filter((row) => matches(row, filter))), builder),
    order: (_field: string, options: { ascending: boolean }) => ((ascending = options.ascending), builder),
    limit: (count: number) => {
      const key = (row: Row) => `${canonicalStamp(row.created_at)} ${row.id}`;
      rows = rows.toSorted((a, b) => (key(a) < key(b) ? -1 : 1) * (ascending ? 1 : -1)).slice(0, count);
      return builder;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

vi.mock('server-only', () => ({}));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => ({ from }) }));

const { loadThread, THREAD_PAGE } = await import('./thread');

const member = { household: { id: HOUSEHOLD, name: 'Gia đình Demo' }, role: 'member', isOperator: false } as const;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const note = (n: number, createdAt: string, fields: Partial<Row> = {}): Row => ({ id: uuid(n), title: `Ghi chú ${n}`, body_md: null, status: 'new', audience: 'all', created_at: createdAt, proposal: null, related: null, citations: null, kind: 'note', severity: 'info', dedupe_key: `note:${n}`, ...fields });
const message = (n: number, role: 'user' | 'assistant', createdAt: string): Row => ({ id: uuid(n), conversation_id: uuid(9999), role, content_md: `Tin ${n}`, status: 'done', refs: [], deferred_until: null, created_at: createdAt });
const at = (minute: number, fraction = '') => `2026-10-07T00:${String(minute).padStart(2, '0')}:00${fraction}+00:00`;
const ids = (thread: Awaited<ReturnType<typeof loadThread>>) => thread.entries.map((entry) => (entry.kind === 'note' ? entry.note.id : entry.message.id));

describe('loadThread', () => {
  it('orders by time, a note before a message at the same instant, then by id, oldest first', async () => {
    stored.agent_items = [note(3, at(5)), note(2, at(5)), note(1, at(1))];
    stored.messages = [message(11, 'user', at(5)), message(12, 'assistant', at(5, '.001')), message(10, 'user', at(1, '.000001'))];
    const thread = await loadThread(member);
    expect(ids(thread)).toEqual([uuid(1), uuid(10), uuid(2), uuid(3), uuid(11), uuid(12)]);
    expect(thread.entries.map((entry) => entry.kind)).toEqual(['note', 'question', 'note', 'note', 'question', 'answer']);
    expect(thread).toMatchObject({ before: null, newer: false });
  });

  it('shows the newest page and pages back from its oldest entry, missing none that share its instant', async () => {
    stored.agent_items = Array.from({ length: 30 }, (_, i) => note(i + 1, at(10)));
    stored.messages = Array.from({ length: 30 }, (_, i) => message(100 + i, i % 2 === 0 ? 'user' : 'assistant', at(i < 15 ? 5 : 20, `.${String(i).padStart(6, '0')}`)));
    const newest = await loadThread(member);
    expect(newest.entries).toHaveLength(THREAD_PAGE);
    expect(newest.before).not.toBeNull();
    expect(newest.newer).toBe(false);
    const older = await loadThread(member, { before: newest.before ?? '' });
    expect(older).toMatchObject({ before: null, newer: true });
    const all = [...ids(older), ...ids(newest)];
    expect(all).toHaveLength(60);
    expect(new Set(all).size).toBe(60);
    expect(all.slice(0, 15)).toEqual(Array.from({ length: 15 }, (_, i) => uuid(100 + i)));
    expect(all.slice(15, 45)).toEqual(Array.from({ length: 30 }, (_, i) => uuid(i + 1)));
  });

  it('opens the page around `?note=`, with the note in it and the entries on both sides', async () => {
    stored.agent_items = Array.from({ length: 60 }, (_, i) => note(i + 1, at(i)));
    stored.messages = [];
    const thread = await loadThread(member, { note: uuid(30) });
    expect(ids(thread)).toEqual(Array.from({ length: THREAD_PAGE }, (_, i) => uuid(i + 11)));
    expect(thread.newer).toBe(true);
    expect(parseCursor(thread.before ?? '')?.id).toBe(uuid(11));
  });

  it('opens the newest page for a note RLS hides from her, such as an operator item, and ignores a cursor it did not write', async () => {
    stored.agent_items = [note(1, at(1))];
    stored.messages = [message(10, 'user', at(2))];
    expect(ids(await loadThread(member, { note: uuid(77) }))).toEqual([uuid(1), uuid(10)]);
    expect(ids(await loadThread(member, { note: 'abc', before: '2026-10-07T00:01:00Z_0_x' }))).toEqual([uuid(1), uuid(10)]);
  });
});

describe('loadThread pinned', () => {
  const action = { severity: 'action' } as const;
  const proposal = { kind: 'proposal', proposal: { type: 'create_task', params: {} } } as const;

  it('pins open action notes before waiting proposals, newest first, shows three and counts them all', async () => {
    stored.messages = [];
    stored.agent_items = [
      note(1, at(1), action),
      note(2, at(2), { ...action, status: 'read' }),
      note(3, at(9), proposal),
      note(4, at(3), proposal),
      note(5, at(8)),
    ];
    const { pinned } = await loadThread(member);
    expect(pinned.shown).toEqual([
      { id: uuid(2), title: 'Ghi chú 2', proposal: false },
      { id: uuid(1), title: 'Ghi chú 1', proposal: false },
      { id: uuid(3), title: 'Ghi chú 3', proposal: true },
    ]);
    expect(pinned.count, 'the older proposal is counted, the info note is not').toBe(4);
  });

  it('never pins a brief, a weekly review, a hidden note or a decided proposal, on any page of the thread', async () => {
    stored.messages = [];
    stored.agent_items = [
      note(1, at(1), { ...action, kind: 'brief' }),
      note(2, at(2), { ...action, kind: 'weekly' }),
      note(3, at(3), { ...action, status: 'dismissed' }),
      note(4, at(4), { ...action, status: 'done' }),
      note(5, at(5), { ...proposal, status: 'approved' }),
      note(6, at(6), { ...proposal, status: 'dismissed' }),
      note(7, at(7), action),
    ];
    for (const options of [{}, { note: uuid(1) }, { before: `${canonicalStamp(at(2))}_0_${uuid(2)}` }]) {
      expect((await loadThread(member, options)).pinned).toEqual({ shown: [{ id: uuid(7), title: 'Ghi chú 7', proposal: false }], count: 1 });
    }
  });
});

describe('windowFilter', () => {
  const from = { stamp: '2026-10-07T00:05:00.000000Z', rank: 0, id: uuid(5) } as const;
  it('keeps a message at the instant of an older note newer than it, and a note at that instant older', () => {
    expect(windowFilter(1, { direction: 'older', from, inclusive: false, limit: 1 })).toBe('created_at.lt."2026-10-07T00:05:00.000000Z"');
    expect(windowFilter(1, { direction: 'newer', from, inclusive: false, limit: 1 })).toBe('created_at.gte."2026-10-07T00:05:00.000000Z"');
    expect(windowFilter(0, { direction: 'older', from: { ...from, rank: 1 }, inclusive: false, limit: 1 })).toBe('created_at.lte."2026-10-07T00:05:00.000000Z"');
  });

  it('compares one source by id at the cursor instant, taking the cursor row only when inclusive', () => {
    expect(windowFilter(0, { direction: 'older', from, inclusive: true, limit: 1 })).toBe(`created_at.lt."2026-10-07T00:05:00.000000Z",and(created_at.eq."2026-10-07T00:05:00.000000Z",id.lte.${uuid(5)})`);
    expect(windowFilter(0, { direction: 'newer', from, inclusive: false, limit: 1 })).toBe(`created_at.gt."2026-10-07T00:05:00.000000Z",and(created_at.eq."2026-10-07T00:05:00.000000Z",id.gt.${uuid(5)})`);
  });

  it('reads a PostgREST stamp to the microsecond, in UTC', () => {
    expect(canonicalStamp('2026-10-07T07:00:00.12345+07:00')).toBe('2026-10-07T00:00:00.123450Z');
    expect(canonicalStamp('2026-10-07T00:00:00+00:00')).toBe('2026-10-07T00:00:00.000000Z');
  });
});
