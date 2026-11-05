import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPORT_TABLES } from '@esta/core/export';
import { parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import type { EntryData, ExportSink } from './sink';
import { writeExport } from './writeExport';

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const clock = { source: 'table', now: () => parseInstant('2026-10-07T02:00:00Z'), today: () => '2026-10-07' } as const;

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

const row = (index: number) => ({ id: `id-${index}`, household_id: HOUSEHOLD, note: `Ghi chú ${index}, "một"` });

function fakeClient(auditRows: number, files: Record<string, string>, documents: readonly { id: string; storage_path: string }[] = []) {
  const reads: { table: string; from: number }[] = [];
  const client = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          reads.push({ table, from });
          const total = table === 'audit_log' ? auditRows : 0;
          const data: Record<string, unknown>[] = table === 'documents' ? [...documents] : Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => row(from + i));
          return Promise.resolve({ data, error: null });
        },
      };
      return query;
    },
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) => {
          const names = Object.keys(files).filter((path) => path.startsWith(`${bucket}/${prefix}/`)).map((path) => path.slice(`${bucket}/${prefix}/`.length));
          const entries = [...new Set(names.map((name) => name.split('/')[0] ?? ''))].map((name) => ({ name, id: names.includes(name) ? `obj-${name}` : null }));
          return Promise.resolve({ data: entries, error: null });
        },
        download: (path: string) => Promise.resolve({ data: new Blob([files[`${bucket}/${path}`] ?? '']), error: null }),
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, reads };
}

async function collect(data: EntryData): Promise<string> {
  if (data instanceof Uint8Array) return decoder.decode(data);
  let text = '';
  for await (const chunk of data) text += decoder.decode(chunk);
  return text;
}

function recordingSink() {
  const entries = new Map<string, string>();
  let manifestParts: readonly string[] = [];
  const sink: ExportSink = {
    async add(path, data) {
      entries.set(path, await collect(data));
    },
    async finish(manifest) {
      entries.set('manifest.json', await collect(manifest(['x.zip'])));
      manifestParts = ['x.zip'];
    },
  };
  return { sink, entries, parts: () => manifestParts };
}

describe('writeExport', () => {
  it('writes a JSON and a CSV file for every registry table, empty ones included', async () => {
    const { client } = fakeClient(0, {});
    const { sink, entries } = recordingSink();
    await writeExport(client, HOUSEHOLD, sink, { clock });
    for (const table of EXPORT_TABLES) {
      expect(JSON.parse(entries.get(`tables/${table.name}.json`) ?? 'x'), table.name).toEqual([]);
      expect(entries.get(`tables/${table.name}.csv`)?.startsWith('﻿'), table.name).toBe(true);
    }
  });

  it('pages past the REST row limit and writes every row of a long table once', async () => {
    const { client, reads } = fakeClient(2500, {});
    const { sink, entries } = recordingSink();
    const { manifest } = await writeExport(client, HOUSEHOLD, sink, { clock });
    const rows: unknown[] = JSON.parse(entries.get('tables/audit_log.json') ?? '[]');
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => (r as { id: string }).id)).size).toBe(2500);
    expect(manifest.tables.audit_log).toBe(2500);
    expect(reads.filter((read) => read.table === 'audit_log' && read.from < 3000).map((read) => read.from)).toEqual([0, 1000, 2000, 0, 1000, 2000]);
    expect(entries.get('tables/audit_log.csv')?.split('\r\n')).toHaveLength(2500 + 2);
  });

  it('walks folders, writes every object under files, and logs only the documents whose file went in', async () => {
    const path = `${HOUSEHOLD}/doc-1/so-hong.pdf`;
    const { client } = fakeClient(0, { [`documents/${path}`]: 'PDF', [`documents/${HOUSEHOLD}/doc-9/other.pdf`]: 'X', [`property-photos/${HOUSEHOLD}/p/cover.webp`]: 'IMG' }, [{ id: 'doc-1', storage_path: path }, { id: 'doc-7', storage_path: `${HOUSEHOLD}/doc-7/lost.pdf` }]);
    const { sink, entries } = recordingSink();
    const { manifest, documentIds } = await writeExport(client, HOUSEHOLD, sink, { clock });
    expect([...entries.keys()].filter((name) => name.startsWith('files/')).sort()).toEqual([
      `files/documents/${HOUSEHOLD}/doc-1/so-hong.pdf`,
      `files/documents/${HOUSEHOLD}/doc-9/other.pdf`,
      `files/property-photos/${HOUSEHOLD}/p/cover.webp`,
    ]);
    expect(manifest.files).toBe(3);
    expect(documentIds).toEqual(['doc-1']);
  });

  it('writes the manifest last, with the Clock date', async () => {
    const { client } = fakeClient(1, {});
    const { sink, entries } = recordingSink();
    await writeExport(client, HOUSEHOLD, sink, { clock });
    expect([...entries.keys()].at(-1)).toBe('manifest.json');
    expect(JSON.parse(entries.get('manifest.json') ?? '{}')).toMatchObject({ exportedAt: '2026-10-07T02:00:00.000Z', householdId: HOUSEHOLD, parts: ['x.zip'] });
  });
});
