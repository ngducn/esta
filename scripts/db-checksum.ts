import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot, slotWorkdir } from './slot.ts';

export type TableChecksum = { table: string; rows: number; md5: string };

// audit_log ids and times are set at write time; created_at and updated_at may legitimately differ between runs.
const SKIPPED_TABLES = ['audit_log'];
const SKIPPED_COLUMNS = ['created_at', 'updated_at'];

function query<Row>(workdir: string, sql: string): Row[] {
  const result = spawnSync('supabase', ['db', 'query', '--workdir', workdir, '--agent=no', '-o', 'json', sql], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`supabase db query failed:\n${result.stderr}`);
  return JSON.parse(result.stdout) as Row[];
}

function literal(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** One md5 per public table over every column but the timestamps, rows in text order so the result is total. */
export function tableChecksums(workdir: string): TableChecksum[] {
  const tables = query<{ table_name: string; ident: string; columns: string }>(
    workdir,
    `select c.table_name, format('%I', c.table_name) as ident,
            string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) as columns
     from information_schema.columns c
     join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.table_name not in (${SKIPPED_TABLES.map(literal).join(', ')})
       and c.column_name not in (${SKIPPED_COLUMNS.map(literal).join(', ')})
     group by c.table_name
     order by c.table_name`,
  );
  if (tables.length === 0) return [];
  const selects = tables.map(
    ({ table_name, ident, columns }) =>
      `select ${literal(table_name)} as table, count(*)::int as rows,
              md5(coalesce(string_agg(r::text, E'\\n' order by r::text), '')) as md5
       from (select ${columns} from public.${ident}) r`,
  );
  return query<TableChecksum>(workdir, `${selects.join('\nunion all\n')}\norder by 1`);
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  for (const { table, rows, md5 } of tableChecksums(slotWorkdir(repoRoot, parseSlot(process.env.ESTA_SLOT)))) {
    console.log(`${md5}  ${String(rows).padStart(5)}  ${table}`);
  }
}
