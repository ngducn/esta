import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { localTarget, readExport, runSql, type ExportSource } from './export-source.ts';

const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

/** A dollar-quote tag that appears nowhere in the data, so the JSON cannot close its own string. */
export function quoteTag(json: string): string {
  let tag = 'esta';
  while (json.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$`;
}

/**
 * One script, one transaction. `session_replication_role = replica` skips the audit and guard triggers and the foreign
 * keys, so the rows land exactly as exported, `audit_log` included, and a row may point at a user this database lacks.
 * Members lose their `user_id`; each reclaims the row at first sign-in through `invited_email`.
 */
export function importScript({ tables }: ExportSource): string {
  const statements = EXPORT_TABLES.map((table) => {
    const rows = (tables.get(table.name) ?? []).map((row) => (table.name === 'household_members' ? { ...row, user_id: null } : row));
    if (rows.length === 0) return '';
    const json = JSON.stringify(rows);
    const tag = quoteTag(json);
    const columns = table.columns.map((column) => `"${column}"`).join(', ');
    return `insert into public.${table.name} (${columns}) overriding system value\nselect ${columns} from jsonb_populate_recordset(null::public.${table.name}, ${tag}${json}${tag}::jsonb);`;
  });
  const sequence = "select setval(pg_get_serial_sequence('public.audit_log', 'id'), greatest((select max(id) from public.audit_log), 1));";
  return ['begin;', 'set local session_replication_role = replica;', ...statements, sequence, 'commit;'].join('\n');
}

async function uploadFiles(source: ExportSource, apiUrl: string, serviceKey: string): Promise<number> {
  const storage = createClient(apiUrl, serviceKey, { auth: { persistSession: false } }).storage;
  let uploaded = 0;
  for (const [path, bytes] of source.files) {
    const [bucket = '', ...rest] = path.split('/');
    const name = rest.join('/');
    const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
    const { error } = await storage.from(bucket).upload(name, bytes, { upsert: true, contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream' });
    if (error) throw new Error(`Uploading ${path} failed: ${error.message}`);
    uploaded += 1;
  }
  return uploaded;
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
  const file = join(tmpdir(), `esta-import-${process.pid}.sql`);
  writeFileSync(file, importScript(source));
  try {
    runSql(target.dbUrl, file, { file: true });
  } finally {
    unlinkSync(file);
  }
  console.log(`imported ${[...source.tables.values()].reduce((sum, rows) => sum + rows.length, 0)} rows`);
  console.log(`uploaded ${await uploadFiles(source, target.apiUrl, target.serviceKey)} files`);
}
