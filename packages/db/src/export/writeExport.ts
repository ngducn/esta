import type { Clock } from '@esta/core';
import { buildManifest, csvHead, csvRows, EXPORT_TABLES, type ExportManifest, type HouseholdTable } from '@esta/core/export';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ExportSink } from './sink';

export const EXPORT_BUCKETS = ['documents', 'property-photos'] as const;

const PAGE_ROWS = 1000;
const LIST_LIMIT = 100;
const encoder = new TextEncoder();
const pageSchema = z.array(z.record(z.string(), z.unknown()));
type Row = Record<string, unknown>;

export type WriteExportOptions = { readonly clock: Clock };

export type WrittenExport = {
  readonly manifest: ExportManifest;
  readonly documentIds: readonly string[];
};

/** Pages of at most one REST page of rows, so a table is never cut short at the row limit and never held whole. */
async function* pagesOf(client: SupabaseClient, table: HouseholdTable, householdId: string): AsyncGenerator<Row[]> {
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await client
      .from(table.name)
      .select(table.columns.join(','))
      .eq(table.scope, householdId)
      .order('id')
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`Reading ${table.name} failed: ${error.message}`);
    const rows = pageSchema.parse(data);
    if (rows.length > 0) yield rows;
    if (rows.length < PAGE_ROWS) return;
  }
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

export async function writeExport(client: SupabaseClient, householdId: string, sink: ExportSink, { clock }: WriteExportOptions): Promise<WrittenExport> {
  const counts: { table: string; rows: number }[] = [];
  const documentPaths = new Map<string, string>();
  for (const table of EXPORT_TABLES) {
    let rows = 0;
    const onRows = (page: Row[]) => {
      rows += page.length;
      if (table.name === 'documents') for (const row of page) documentPaths.set(String(row.storage_path), String(row.id));
    };
    await sink.add(`tables/${table.name}.json`, jsonChunks(pagesOf(client, table, householdId), onRows));
    await sink.add(`tables/${table.name}.csv`, csvChunks(pagesOf(client, table, householdId), table.columns));
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
    manifest = buildManifest({ clock, householdId, counts, files, parts });
    return encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  });
  if (manifest === undefined) throw new Error('The sink wrote no manifest');
  return { manifest, documentIds };
}
