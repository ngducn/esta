import { clockAt, parseInstant } from '@esta/core';
import { describe, expect, it, vi } from 'vitest';
import type { CronClient } from './supabase';

vi.mock('server-only', () => ({}));
const { sweepDocumentFiles } = await import('./document-sweep');

const NOW = '2026-10-07T09:00:00+07:00';
const clock = clockAt({ kind: 'table', now: parseInstant(NOW) }, 'Asia/Ho_Chi_Minh');

function fakeClient({ pending = [] as string[], strays = [] as string[], failing = [] as string[] } = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const client = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push(`${name}${args ? ` ${JSON.stringify(args)}` : ''}`);
      const data = name === 'pending_file_removal_names' ? pending : name === 'stray_document_files' ? strays : 1;
      return Promise.resolve({ data, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (names: string[]) => {
          calls.push(`remove ${bucket}`);
          removed.push(names);
          const bad = names.some((name) => failing.includes(name));
          return Promise.resolve(bad ? { data: null, error: { message: 'down' } } : { data: names.map((name) => ({ name })), error: null });
        },
      }),
    },
  };
  return { client: client as unknown as CronClient, calls, removed };
}

describe('sweepDocumentFiles', () => {
  it('removes erased files first, then strays older than a day in Storage, then settles the names', async () => {
    const { client, calls, removed } = fakeClient({ pending: ['h/d1/front.jpg'], strays: ['h/d2/a.jpg', 'h/d2/b.jpg'] });
    const run = await sweepDocumentFiles(client, clock);
    expect(removed).toEqual([['h/d1/front.jpg'], ['h/d2/a.jpg', 'h/d2/b.jpg']]);
    expect(calls).toEqual([
      'pending_file_removal_names',
      'remove documents',
      'stray_document_files',
      'remove documents',
      'settle_file_removals',
    ]);
    expect(run).toEqual({ ok: true, as_of: '2026-10-07', strays: 2, erased: 1, settled: 1 });
  });

  it('asks for strays without the Clock, so a clock set a week ahead names no younger file', async () => {
    const ahead = clockAt({ kind: 'table', now: parseInstant('2026-10-14T09:00:00+07:00') }, 'Asia/Ho_Chi_Minh');
    const { client, calls } = fakeClient();
    await sweepDocumentFiles(client, ahead);
    expect(calls.filter((call) => call.startsWith('stray_document_files'))).toEqual(['stray_document_files']);
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
});
