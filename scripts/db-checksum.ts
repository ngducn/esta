import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot, slotWorkdir } from './slot.ts';

export type TableChecksum = { table: string; rows: number; md5: string };

const NON_BUSINESS_TABLES = ['audit_log'];
export const NON_BUSINESS_COLUMNS = ['created_at', 'updated_at'];

export const SEEDED_AUTH_COLUMNS: Record<string, readonly string[]> = {
  'auth.users': [
    'instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at', 'raw_app_meta_data',
    'raw_user_meta_data', 'confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
  ],
  'auth.identities': ['id', 'provider_id', 'user_id', 'identity_data', 'provider'],
};

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

export function businessChecksums(workdir: string): TableChecksum[] {
  const publicTables = query<{ table: string; relation: string; columns: string }>(
    workdir,
    `select c.table_name as table, format('public.%I', c.table_name) as relation,
            string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) as columns
     from information_schema.columns c
     join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.table_name not in (${NON_BUSINESS_TABLES.map(literal).join(', ')})
       and c.column_name not in (${NON_BUSINESS_COLUMNS.map(literal).join(', ')})
     group by c.table_name
     order by c.table_name`,
  );
  const authTables = Object.entries(SEEDED_AUTH_COLUMNS).map(([table, columns]) => ({
    table,
    relation: table,
    columns: columns.join(', '),
  }));
  const selects = [...publicTables, ...authTables].map(
    ({ table, relation, columns }) =>
      `select ${literal(table)} as table, count(*)::int as rows,
              md5(coalesce(string_agg(r::text, E'\\n' order by r::text), '')) as md5
       from (select ${columns} from ${relation}) r`,
  );
  return query<TableChecksum>(workdir, `${selects.join('\nunion all\n')}\norder by 1`);
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  for (const { table, rows, md5 } of businessChecksums(slotWorkdir(repoRoot, parseSlot(process.env.ESTA_SLOT)))) {
    console.log(`${md5}  ${String(rows).padStart(5)}  ${table}`);
  }
}
