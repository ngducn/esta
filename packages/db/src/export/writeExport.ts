import type { Clock } from '@esta/core';
import { buildManifest, csvHead, csvRows, EXPORT_TABLES, type ExportExporter, type ExportManifest, type HouseholdTable } from '@esta/core/export';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ExportSink } from './sink';

export const EXPORT_BUCKETS = ['documents', 'property-photos'] as const;

const PAGE_ROWS = 1000;
const LIST_LIMIT = 100;
const encoder = new TextEncoder();
const pageSchema = z.array(z.record(z.string(), z.unknown()));
type Row = Record<string, unknown>;

export type WriteExportOptions = {
  readonly clock: Clock;
  /** The member whose session reads the household; the manifest records it and what that session cannot read. */
  readonly exporter: ExportExporter;
  readonly pageRows?: number;
};

export type WrittenExport = {
  readonly manifest: ExportManifest;
  readonly documentIds: readonly string[];
};

/**
 * Pages by key (`id` after the last one read), so a row inserted or deleted mid-read can neither repeat nor shift another
 * across a page edge, and ends on an empty page, so a server that caps rows below `pageRows` cannot cut a table short.
 * An exact count taken afterwards must equal the rows read; otherwise the export fails rather than ship a short table.
 */
async function* pagesOf(client: SupabaseClient, table: HouseholdTable, householdId: string, pageRows: number): AsyncGenerator<Row[]> {
  let after: string | number | undefined;
  let read = 0;
  for (;;) {
    const base = client.from(table.name).select(table.columns.join(',')).eq(table.scope, householdId);
    const { data, error } = await (after === undefined ? base : base.gt('id', after)).order('id').limit(pageRows);
    if (error) throw new Error(`Reading ${table.name} failed: ${error.message}`);
    const rows = pageSchema.parse(data);
    const last = rows.at(-1)?.id;
    if (last === undefined) break;
    if (typeof last !== 'string' && typeof last !== 'number') throw new Error(`Reading ${table.name} failed: a row has no usable id`);
    after = last;
    read += rows.length;
    yield rows;
  }
  const { count, error } = await client.from(table.name).select('id', { count: 'exact', head: true }).eq(table.scope, householdId);
  if (error) throw new Error(`Counting ${table.name} failed: ${error.message}`);
  if (count !== read) throw new Error(`Reading ${table.name} returned ${read} of ${count} rows; try again`);
}

async function* jsonChunks(pages: AsyncIterable<Row[]>, onRows: (rows: Row[]) => void): AsyncGenerator<Uint8Array> {
  let first = true;
  for await (const rows of pages) {
    onRows(rows);
    yield encoder.encode(`${first ? '[\n' : ',\n'}${rows.map((row) => JSON.stringify(row)).join(',\n')}`);
    first = false;
  }
  yield encoder.encode(first ? '[]\n' : '\n]\n');
}

async function* csvChunks(pages: AsyncIterable<Row[]>, columns: readonly string[]): AsyncGenerator<Uint8Array> {
  yield encoder.encode(csvHead(columns));
  for await (const rows of pages) yield encoder.encode(csvRows(columns, rows));
}

type StorageObject = { readonly bucket: string; readonly path: string };

async function* objectsUnder(client: SupabaseClient, bucket: string, prefix: string): AsyncGenerator<StorageObject> {
  for (let offset = 0; ; offset += LIST_LIMIT) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: LIST_LIMIT, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Listing ${bucket}/${prefix} failed: ${error.message}`);
    for (const entry of data) {
      if (entry.id === null) yield* objectsUnder(client, bucket, `${prefix}/${entry.name}`);
      else yield { bucket, path: `${prefix}/${entry.name}` };
    }
    if (data.length < LIST_LIMIT) return;
  }
}

export async function writeExport(client: SupabaseClient, householdId: string, sink: ExportSink, { clock, exporter, pageRows = PAGE_ROWS }: WriteExportOptions): Promise<WrittenExport> {
  const counts: { table: string; rows: number }[] = [];
  const documentPaths = new Map<string, string>();
  for (const table of EXPORT_TABLES) {
    let rows = 0;
    const onRows = (page: Row[]) => {
      rows += page.length;
      if (table.name === 'documents') for (const row of page) documentPaths.set(String(row.storage_path), String(row.id));
    };
    await sink.add(`tables/${table.name}.json`, jsonChunks(pagesOf(client, table, householdId, pageRows), onRows));
    await sink.add(`tables/${table.name}.csv`, csvChunks(pagesOf(client, table, householdId, pageRows), table.columns));
    counts.push({ table: table.name, rows });
  }

  const documentIds: string[] = [];
  let files = 0;
  for (const bucket of EXPORT_BUCKETS) {
    for await (const object of objectsUnder(client, bucket, householdId)) {
      const { data, error } = await client.storage.from(object.bucket).download(object.path);
      if (error || data === null) throw new Error(`Reading ${object.bucket}/${object.path} failed: ${error?.message ?? 'no data'}`);
      await sink.add(`files/${object.bucket}/${object.path}`, new Uint8Array(await data.arrayBuffer()), data.size);
      files += 1;
      const documentId = bucket === 'documents' ? documentPaths.get(object.path) : undefined;
      if (documentId !== undefined) documentIds.push(documentId);
    }
  }

  let manifest: ExportManifest | undefined;
  await sink.finish((parts) => {
    manifest = buildManifest({ clock, householdId, counts, files, parts, exporter });
    return encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  });
  if (manifest === undefined) throw new Error('The sink wrote no manifest');
  return { manifest, documentIds };
}
