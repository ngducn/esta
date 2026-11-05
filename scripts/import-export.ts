import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { sniffDocumentMime } from '../packages/core/src/documents/sniff.ts';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { localTarget, readExport, runSql, type ExportSource } from './export-source.ts';

const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

/** `documents.mime` by `storage_path`: a storage name may end in any extension or none, so the row is the one source of a document's type. */
export const documentMimes = (rows: readonly { readonly storage_path?: unknown; readonly mime?: unknown }[]): ReadonlyMap<string, string> =>
  new Map(rows.flatMap((row) => (typeof row.storage_path === 'string' && typeof row.mime === 'string' ? [[row.storage_path, row.mime] as const] : [])));

/** The row's type for a document file; otherwise the extension (property photos and the copies made from a document); otherwise the file's first bytes. */
export function contentTypeFor(path: string, documents: ReadonlyMap<string, string>, bytes: Uint8Array): string {
  const [bucket = '', ...rest] = path.split('/');
  const name = rest.join('/');
  const fromRow = bucket === 'documents' ? documents.get(name) : undefined;
  return fromRow ?? CONTENT_TYPES[name.split('.').at(-1)?.toLowerCase() ?? ''] ?? sniffDocumentMime(bytes) ?? 'application/octet-stream';
}

export function quoteTag(base: string, text: string): string {
  let tag = base;
  while (text.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$`;
}

/** A job the export caught mid-run (the backup's own row) would be reclaimed by a worker on the new database, so it lands failed; the schedule queues the next night's job. */
const settleRunningJob = (row: Record<string, unknown>): Record<string, unknown> =>
  row.status === 'running'
    ? { ...row, status: 'failed', locked_by: null, locked_at: null, finished_at: row.finished_at ?? row.locked_at ?? row.updated_at ?? null, error: 'Was running when this copy was taken, so it was not run again after the data was restored' }
    : row;

/**
 * One `do` block, so one statement and one transaction (the CLI sends a script as a single prepared statement).
 * `session_replication_role = replica` skips the audit and guard triggers and the foreign keys, so the rows land
 * exactly as exported, `audit_log` included, and a row may point at a user this database lacks. Members lose their
 * `user_id`; each reclaims the row at first sign-in through `invited_email`.
 */
export function importScript({ tables }: ExportSource): string {
  const statements = EXPORT_TABLES.map((table) => {
    const rows = (tables.get(table.name) ?? []).map((row) => (table.name === 'household_members' ? { ...row, user_id: null } : table.name === 'agent_jobs' ? settleRunningJob(row) : row));
    if (rows.length === 0) return '';
    const json = JSON.stringify(rows);
    const tag = quoteTag('esta', json);
    const columns = table.columns.map((column) => `"${column}"`).join(', ');
    return `insert into public.${table.name} (${columns}) overriding system value\nselect ${columns} from jsonb_populate_recordset(null::public.${table.name}, ${tag}${json}${tag}::jsonb);`;
  });
  const sequence = "perform setval(pg_get_serial_sequence('public.audit_log', 'id'), greatest((select max(id) from public.audit_log), 1));";
  const body = ['set local session_replication_role = replica;', ...statements, sequence].join('\n');
  const outer = quoteTag('import', body);
  return `do ${outer}\nbegin\n${body}\nend\n${outer};`;
}

/** Runs before the rows are written: a file the bucket refuses then leaves the database empty, and a rerun uploads again over the same names. */
async function uploadFiles(source: ExportSource, apiUrl: string, serviceKey: string, uploaded: string[]): Promise<void> {
  const storage = createClient(apiUrl, serviceKey, { auth: { persistSession: false } }).storage;
  const documents = documentMimes(source.tables.get('documents') ?? []);
  for (const [path, bytes] of source.files) {
    const [bucket = '', ...rest] = path.split('/');
    const name = rest.join('/');
    const { error } = await storage.from(bucket).upload(name, bytes, { upsert: true, contentType: contentTypeFor(path, documents, bytes) });
    if (error) throw new Error(`Uploading ${path} failed: ${error.message}`);
    uploaded.push(path);
  }
}

export type ImportTarget = Pick<ReturnType<typeof localTarget>, 'dbUrl' | 'apiUrl' | 'serviceKey'>;

/** Removes the files this run uploaded, no others; returns the paths that stayed. */
async function removeUploaded(paths: readonly string[], apiUrl: string, serviceKey: string): Promise<string[]> {
  const storage = createClient(apiUrl, serviceKey, { auth: { persistSession: false } }).storage;
  const byBucket = new Map<string, string[]>();
  for (const path of paths) byBucket.set(path.split('/')[0] ?? '', [...(byBucket.get(path.split('/')[0] ?? '') ?? []), path]);
  const stayed: string[] = [];
  for (const [bucket, bucketPaths] of byBucket) {
    for (let from = 0; from < bucketPaths.length; from += 100) {
      const batch = bucketPaths.slice(from, from + 100);
      const { error } = await storage.from(bucket).remove(batch.map((path) => path.split('/').slice(1).join('/')));
      if (error) stayed.push(...batch);
    }
  }
  return stayed;
}

export async function runImport(source: ExportSource, target: ImportTarget): Promise<void> {
  const uploaded: string[] = [];
  try {
    await uploadFiles(source, target.apiUrl, target.serviceKey, uploaded);
    console.log(`uploaded ${uploaded.length} files`);
    const file = join(tmpdir(), `esta-import-${process.pid}.sql`);
    writeFileSync(file, importScript(source), { mode: 0o600 });
    try {
      runSql(target.dbUrl, file, { file: true });
    } finally {
      unlinkSync(file);
    }
  } catch (error) {
    const stayed = await removeUploaded(uploaded, target.apiUrl, target.serviceKey).catch(() => uploaded);
    if (stayed.length === 0) console.error(`The import failed, so the ${uploaded.length} file(s) it uploaded were removed. Fix the cause and run it again.`);
    else console.error(`The import failed and ${stayed.length} uploaded file(s) could not be removed:\n${stayed.join('\n')}\nRemove them from Storage, then run the import again; a rerun uploads over the same names.`);
    throw error;
  }
  console.log(`imported ${[...source.tables.values()].reduce((sum, rows) => sum + rows.length, 0)} rows`);
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: node scripts/import-export.ts <export zip or folder>... (every part of a large export)');
    process.exit(2);
  }
  const target = localTarget();
  const source = readExport(paths);
  const existing = runSql<{ households: number }>(target.dbUrl, 'select count(*)::int as households from public.households')[0]?.households ?? 0;
  if (existing > 0) throw new Error(`ESTA_SLOT=${target.slot} already holds ${existing} household(s); run pnpm db:reset:empty first`);
  await runImport(source, target);
}
