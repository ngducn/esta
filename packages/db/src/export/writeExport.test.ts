import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPORT_TABLES } from '@esta/core/export';
import { isoDate, parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { fakeStorage, recordingSink } from './test-support';
import { writeExport } from './writeExport';

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const clock = { source: 'table', now: () => parseInstant('2026-10-07T02:00:00Z'), today: () => isoDate('2026-10-07') } as const;

const exporter = { role: 'admin', isOperator: true };

const row = (index: number) => ({ id: `id-${String(index).padStart(5, '0')}`, household_id: HOUSEHOLD, note: `Ghi chú ${index}, "một"` });

type Fake = {
  audit?: number;
  documents?: readonly { id: string; storage_path: string }[];
  /** The most rows the server returns for one request, like the API's `max_rows`. */
  maxRows?: number;
  /** Runs once, before the second page of `audit_log` is answered. */
  between?: (rows: Record<string, unknown>[]) => void;
  /** Added to the exact count, to model rows the pages did not reach. */
  countDrift?: number;
  /** Document files of erased ID cards that Storage still holds. */
  waiting?: readonly string[];
};

function fakeClient(files: Record<string, string>, fake: Fake = {}) {
  const reads: { table: string; after: unknown }[] = [];
  const auditRows = Array.from({ length: fake.audit ?? 0 }, (_, i) => row(i));
  let pages = 0;
  const client = {
    from: (table: string) => {
      const filters: { after?: unknown; limit?: number; head?: boolean } = {};
      const all = () => (table === 'audit_log' ? auditRows : table === 'documents' ? [...(fake.documents ?? [])] : []);
      const query = {
        select: (_columns: string, options?: { head?: boolean }) => {
          filters.head = options?.head === true;
          return query;
        },
        eq: () => query,
        order: () => query,
        limit: (n: number) => {
          filters.limit = n;
          return query;
        },
        gt: (_column: string, value: unknown) => {
          filters.after = value;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (filters.head) return resolve({ count: all().length + (table === 'audit_log' ? (fake.countDrift ?? 0) : 0), error: null });
          reads.push({ table, after: filters.after });
          if (table === 'audit_log' && filters.after !== undefined && ++pages === 1) fake.between?.(auditRows);
          const sorted = all().sort((a, b) => String(a.id).localeCompare(String(b.id)));
          const rest = filters.after === undefined ? sorted : sorted.filter((r) => String(r.id) > String(filters.after));
          return resolve({ data: rest.slice(0, Math.min(filters.limit ?? 1000, fake.maxRows ?? 1000)), error: null });
        },
      };
      return query;
    },
    rpc: (name: string) => Promise.resolve(name === 'pending_file_removal_names' ? { data: fake.waiting ?? [], error: null } : { data: null, error: { message: `unexpected ${name}` } }),
    storage: fakeStorage(files),
  };
  return { client: client as unknown as SupabaseClient, reads };
}

describe('writeExport', () => {
  it('writes a JSON and a CSV file for every registry table, empty ones included', async () => {
    const { client } = fakeClient({});
    const { sink, entries } = recordingSink();
    await writeExport(client, HOUSEHOLD, sink, { clock, exporter });
    for (const table of EXPORT_TABLES) {
      expect(JSON.parse(entries.get(`tables/${table.name}.json`) ?? 'x'), table.name).toEqual([]);
      expect(entries.get(`tables/${table.name}.csv`)?.startsWith('﻿'), table.name).toBe(true);
    }
  });

  it('pages past the page size and writes every row of a long table once', async () => {
    const { client, reads } = fakeClient({}, { audit: 25 });
    const { sink, entries } = recordingSink();
    const { manifest } = await writeExport(client, HOUSEHOLD, sink, { clock, exporter, pageRows: 10 });
    const rows = JSON.parse(entries.get('tables/audit_log.json') ?? '[]') as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => row(i).id));
    expect(manifest.tables.audit_log).toBe(25);
    expect(reads.filter((read) => read.table === 'audit_log').map((read) => read.after)).toEqual([undefined, 'id-00009', 'id-00019', 'id-00024', undefined, 'id-00009', 'id-00019', 'id-00024']);
    expect(entries.get('tables/audit_log.csv')?.split('\r\n')).toHaveLength(25 + 2);
  });

  it('fails rather than ship short when a row lands below the cursor while the export reads', async () => {
    const { client } = fakeClient({}, { audit: 20, between: (rows) => void rows.push({ ...row(0), id: 'id-00003x' }) });
    const { sink, entries } = recordingSink();
    await expect(writeExport(client, HOUSEHOLD, sink, { clock, exporter, pageRows: 10 })).rejects.toThrow(/audit_log/);
    expect(entries.has('manifest.json')).toBe(false);
  });

  it('does not end a table at a short page when the server caps rows below the page size', async () => {
    const { client } = fakeClient({}, { audit: 12, maxRows: 5 });
    const { sink, entries } = recordingSink();
    const { manifest } = await writeExport(client, HOUSEHOLD, sink, { clock, exporter, pageRows: 10 });
    expect(JSON.parse(entries.get('tables/audit_log.json') ?? '[]')).toHaveLength(12);
    expect(manifest.tables.audit_log).toBe(12);
  });

  it('fails with a clear line instead of shipping a table that is short of its exact count', async () => {
    const { client } = fakeClient({}, { audit: 12, countDrift: 3 });
    const { sink, entries } = recordingSink();
    await expect(writeExport(client, HOUSEHOLD, sink, { clock, exporter, pageRows: 10 })).rejects.toThrow('Reading audit_log returned 12 of 15 rows; try again');
    expect(entries.has('manifest.json')).toBe(false);
  });

  it('records who exported and what their session could not read', async () => {
    const { client } = fakeClient({});
    const { sink, entries } = recordingSink();
    await writeExport(client, HOUSEHOLD, sink, { clock, exporter: { role: 'admin', isOperator: false }, pageRows: 10 });
    expect(JSON.parse(entries.get('manifest.json') ?? '{}')).toMatchObject({ exporter: { role: 'admin', isOperator: false }, complete: false, withheld: expect.arrayContaining([expect.objectContaining({ table: 'agent_jobs' })]) });
  });

  it('walks folders, writes every object under files, and logs only the documents whose file went in', async () => {
    const path = `${HOUSEHOLD}/doc-1/so-hong.pdf`;
    const { client } = fakeClient({ [`documents/${path}`]: 'PDF', [`documents/${HOUSEHOLD}/doc-9/other.pdf`]: 'X', [`property-photos/${HOUSEHOLD}/p/cover.webp`]: 'IMG' }, { documents: [{ id: 'doc-1', storage_path: path }, { id: 'doc-7', storage_path: `${HOUSEHOLD}/doc-7/lost.pdf` }] });
    const { sink, entries } = recordingSink();
    const { manifest, documentIds } = await writeExport(client, HOUSEHOLD, sink, { clock, exporter });
    expect([...entries.keys()].filter((name) => name.startsWith('files/')).sort()).toEqual([
      `files/documents/${HOUSEHOLD}/doc-1/so-hong.pdf`,
      `files/documents/${HOUSEHOLD}/doc-9/other.pdf`,
      `files/property-photos/${HOUSEHOLD}/p/cover.webp`,
    ]);
    expect(manifest.files).toBe(3);
    expect(documentIds).toEqual(['doc-1']);
  });

  it('leaves out the files of erased ID cards that are waiting to be removed', async () => {
    const waiting = `${HOUSEHOLD}/doc-erased/front.jpg`;
    const { client } = fakeClient({ [`documents/${waiting}`]: 'ID PHOTO', [`documents/${HOUSEHOLD}/doc-1/so-hong.pdf`]: 'PDF' }, { waiting: [waiting] });
    const { sink, entries } = recordingSink();
    const { manifest } = await writeExport(client, HOUSEHOLD, sink, { clock, exporter });
    expect([...entries.keys()].filter((name) => name.startsWith('files/'))).toEqual([`files/documents/${HOUSEHOLD}/doc-1/so-hong.pdf`]);
    expect(manifest.files).toBe(1);
  });

  it('writes the manifest last, with the Clock date', async () => {
    const { client } = fakeClient({}, { audit: 1 });
    const { sink, entries } = recordingSink();
    await writeExport(client, HOUSEHOLD, sink, { clock, exporter });
    expect([...entries.keys()].at(-1)).toBe('manifest.json');
    expect(JSON.parse(entries.get('manifest.json') ?? '{}')).toMatchObject({ exportedAt: '2026-10-07T02:00:00.000Z', householdId: HOUSEHOLD, parts: ['x.zip'] });
  });
});
