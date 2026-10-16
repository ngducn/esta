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

/** Prints each problem and returns whether every public table is covered. */
export function reportTableCoverage(repoRoot: string, slot: number): boolean {
  const tables = publicTables(slotWorkdir(repoRoot, slot));
  const problems = coverageProblems(tables, readTestFiles(join(repoRoot, 'supabase', 'tests')));
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`Table coverage: all ${tables.length} public tables have row level security and a pgTAP file.`);
  return problems.length === 0;
}

if (import.meta.main && !reportTableCoverage(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT))) process.exit(1);
