import { clockAt, parseInstant } from '@esta/core';
import { describe, expect, it, vi } from 'vitest';
import type { CronClient } from './supabase';

vi.mock('server-only', () => ({}));
const { sweepDocumentFiles } = await import('./document-sweep');

const NOW = '2026-10-07T09:00:00+07:00';
const clock = clockAt({ kind: 'table', now: parseInstant(NOW) }, 'Asia/Ho_Chi_Minh');

type StrayArgs = { p_limit?: number; p_exclude?: string[]; p_only?: string[] };

/**
 * A Storage that holds `strays`, answers the sweep query as the database does (limit, names to skip, names to confirm),
 * and removes every name except those in `refusing` (silently, as Storage does) or `failing` (with an error).
 */
function fakeClient({ pending = [] as string[], strays = [] as string[], refusing = [] as string[], failing = [] as string[], registeredLater = [] as string[] } = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const held = new Set(strays);
  const client = {
    rpc: (name: string, args?: StrayArgs) => {
      calls.push(`${name}${args ? ` ${JSON.stringify(args)}` : ''}`);
      if (name === 'pending_file_removal_names') return Promise.resolve({ data: pending, error: null });
      if (name !== 'stray_document_files') return Promise.resolve({ data: 1, error: null });
      const { p_limit = 500, p_exclude = [], p_only } = args ?? {};
      const confirming = p_only !== undefined;
      if (confirming) registeredLater.forEach((later) => held.delete(later));
      const data = [...held].filter((n) => !p_exclude.includes(n) && (p_only === undefined || p_only.includes(n))).toSorted().slice(0, p_limit);
      return Promise.resolve({ data, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (names: string[]) => {
          calls.push(`remove ${bucket}`);
          removed.push(names);
          if (names.some((n) => failing.includes(n))) return Promise.resolve({ data: null, error: { message: 'down' } });
          const gone = names.filter((n) => !refusing.includes(n));
          gone.forEach((n) => held.delete(n));
          return Promise.resolve({ data: gone.map((n) => ({ name: n })), error: null });
        },
      }),
    },
  };
  return { client: client as unknown as CronClient, calls, removed, held };
}

describe('sweepDocumentFiles', () => {
  it('removes erased files first, then strays older than a day in Storage, then settles the names', async () => {
    const { client, calls, removed } = fakeClient({ pending: ['h/d1/front.jpg'], strays: ['h/d2/a.jpg', 'h/d2/b.jpg'] });
    const run = await sweepDocumentFiles(client, clock);
    expect(removed).toEqual([['h/d1/front.jpg'], ['h/d2/a.jpg', 'h/d2/b.jpg']]);
    expect(calls.map((call) => call.split(' ')[0])).toEqual([
      'pending_file_removal_names',
      'remove',
      'stray_document_files',
      'stray_document_files',
      'remove',
      'stray_document_files',
      'settle_file_removals',
    ]);
    expect(run).toEqual({ ok: true, as_of: '2026-10-07', strays: 2, erased: 1, settled: 1 });
  });

  it('asks for strays without the Clock, so a clock set a week ahead names no younger file', async () => {
    const ahead = clockAt({ kind: 'table', now: parseInstant('2026-10-14T09:00:00+07:00') }, 'Asia/Ho_Chi_Minh');
    const { client, calls } = fakeClient({ strays: ['h/d2/a.jpg'] });
    await sweepDocumentFiles(client, ahead);
    const keys = calls.filter((call) => call.startsWith('stray_document_files')).flatMap((call) => Object.keys(JSON.parse(call.slice('stray_document_files '.length)) as object));
    expect(new Set(keys)).toEqual(new Set(['p_limit', 'p_exclude', 'p_only']));
  });

  it('removes nothing and makes no Storage call when there is nothing to remove', async () => {
    const { client, removed } = fakeClient();
    expect(await sweepDocumentFiles(client, clock)).toMatchObject({ strays: 0, erased: 0 });
    expect(removed).toEqual([]);
  });

  it('settles what it could, then fails loudly when Storage keeps a file', async () => {
    const { client, calls } = fakeClient({ pending: ['h/d1/front.jpg'], failing: ['h/d1/front.jpg'] });
    await expect(sweepDocumentFiles(client, clock)).rejects.toThrow('Storage kept 1 files');
    expect(calls.at(-1)).toBe('settle_file_removals');
  });

  it('skips the names Storage keeps refusing, so the strays behind a full page of them are still removed (#425)', async () => {
    const names = Array.from({ length: 700 }, (_, at) => `h/d${String(at).padStart(4, '0')}/front.jpg`);
    const refusing = names.slice(0, 520);
    const { client, held } = fakeClient({ strays: names, refusing });
    await expect(sweepDocumentFiles(client, clock)).rejects.toThrow('Storage kept 520 files');
    expect([...held].toSorted()).toEqual(refusing);
  });

  it('finds the one name Storage errors on among a chunk and removes the rest (#425)', async () => {
    const names = Array.from({ length: 30 }, (_, at) => `h/d${String(at).padStart(2, '0')}/front.jpg`);
    const { client, held } = fakeClient({ strays: names, failing: [names[7] ?? ''] });
    await expect(sweepDocumentFiles(client, clock)).rejects.toThrow('Storage kept 1 files');
    expect([...held]).toEqual([names[7]]);
  });

  it('leaves a file whose folder gained a document row after the listing (#425)', async () => {
    const { client, held, removed } = fakeClient({ strays: ['h/d1/front.jpg', 'h/d2/front.jpg'], registeredLater: ['h/d1/front.jpg'] });
    await sweepDocumentFiles(client, clock);
    expect(removed.flat()).toEqual(['h/d2/front.jpg']);
    expect(held.has('h/d1/front.jpg')).toBe(false);
  });
});
