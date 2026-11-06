import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

export type PublicTable = { readonly name: string; readonly rls: boolean };
export type TestFile = { readonly path: string; readonly text: string };

/** FND-2 holds only for tables that have row level security and a pgTAP file that names them. */
export function coverageProblems(tables: readonly PublicTable[], files: readonly TestFile[]): string[] {
  return tables.flatMap(({ name, rls }) => [
    ...(rls ? [] : [`public.${name} has no row level security`]),
    ...(files.some(({ text }) => new RegExp(`\\b${name}\\b`).test(text)) ? [] : [`public.${name} is named in no pgTAP file under supabase/tests`]),
  ]);
}

/** A table some members cannot read must have a test that proves its rows, history and copies are hidden from them. */
export function hiddenRowProblems(privateTables: readonly string[], files: readonly TestFile[]): string[] {
  return privateTables
    .filter((name) => !files.some(({ text }) => new RegExp(`hidden_everywhere\\(\\s*'(?:public\\.)?${name}'`).test(text)))
    .map((name) => `public.${name} limits who may read its rows, and no pgTAP file calls tests.hidden_everywhere('${name}', ...)`);
}

const HOUSEHOLD_WIDE = ["private.is_member(household_id, 'viewer'::member_role)", "private.is_member(id, 'viewer'::member_role)", 'true'];

/** The public tables whose select policies are narrower than household-wide (or reference data open to all), as `tests.private_tables()` reads them. */
export function privateTables(workdir: string): string[] {
  const wide = HOUSEHOLD_WIDE.map((expr) => `'${expr.replaceAll("'", "''")}'`).join(', ');
  const policy = (permissive: boolean, narrow: boolean) =>
    `exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('r', '*') and ${permissive ? 'p.polpermissive' : 'not p.polpermissive'}
       and pg_get_expr(p.polqual, p.polrelid) ${narrow ? 'not in' : 'in'} (${wide}))`;
  return query<{ name: string }>(
    workdir,
    `select c.relname as name
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'audit_log'
       and ((${policy(true, true)} and not ${policy(true, false)}) or ${policy(false, true)})
     order by 1`,
  ).map(({ name }) => name);
}

export function readTestFiles(dir: string): TestFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ path: join(dir, name), text: readFileSync(join(dir, name), 'utf8') }));
}

export function publicTables(workdir: string): PublicTable[] {
  return query<PublicTable>(
    workdir,
    `select c.relname as name, c.relrowsecurity as rls
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
     order by 1`,
  );
}

export function reportTableCoverage(repoRoot: string, slot: number): boolean {
  const tables = publicTables(slotWorkdir(repoRoot, slot));
  const files = readTestFiles(join(repoRoot, 'supabase', 'tests'));
  const problems = [...coverageProblems(tables, files), ...hiddenRowProblems(privateTables(slotWorkdir(repoRoot, slot)), files)];
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`Table coverage: all ${tables.length} public tables have row level security and a pgTAP file.`);
  return problems.length === 0;
}

if (import.meta.main && !reportTableCoverage(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT))) process.exit(1);
