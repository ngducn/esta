// Usage: pnpm seed:coverage [--database]. Without a flag it reads the `full` generator's rows, as `pnpm check` runs it;
// with --database it counts the rows of every table in the catalog per household on the ESTA_SLOT stack after
// `pnpm db:reset`, and fails when the migrations it parses create other tables than the catalog holds.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_OPTIONS, seedTables, type SeedTables } from '../supabase/seed/generator/index.ts';
import { householdId } from '../supabase/seed/generator/households.ts';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';
import { publicTables } from './table-coverage.ts';

/** Tables the seed leaves empty in every household, each with the reason. */
export const SEED_EXEMPT: Readonly<Record<string, string>> = {
  admin_units: 'reference data the migrations ship; production runs no seed',
  admin_unit_legacy_map: 'reference data the migrations ship',
  bank_bins: 'reference data the migrations ship',
  land_use_codes: 'reference data the migrations ship',
  tax_rules: 'reference data the migrations ship',
  audit_log: 'runtime: the audit trigger writes it on every change, the seed included',
  document_access_log: 'runtime: written when someone opens or downloads a document (DOC-4)',
  worker_heartbeats: 'runtime: the running worker writes it; a fresh reset reads "never"',
  research_items:
    'runtime: research_scan writes them at 06:00 from its replay recording; seeded items would hold the recorded links, so the replayed scan would drop every one as a duplicate and write the empty note instead',
  test_clock: 'runtime: set by pnpm clock:set and the tests (FND-9)',
  change_batches: "runtime: the connector's history of plans Claude applied, with their undo",
  statement_imports:
    'a seeded import would remember its column mapping and claim the fixture transfers, so the LSE-8 specs would not start from a first import; SPEC §9.3 lists the bank statements as fixture files',
  statement_rows: 'the lines of a statement import, as statement_imports',
};

/** Tables the seed's SQL fills through the database after the generator's rows, and the statement in it that does. */
export const WRITTEN_BY_DATABASE: Readonly<Record<string, string>> = {
  invoices: 'perform public.run_invoicing(',
  invoice_lines: 'perform public.run_invoicing(',
  meter_readings: 'insert into public.meter_readings',
  payments: 'insert into public.payments',
  payment_allocations: 'insert into public.payment_allocations',
};

export function migrationTables(migrations: readonly string[]): string[] {
  const tables = new Set<string>();
  for (const sql of migrations) {
    for (const [, verb, table = ''] of sql.matchAll(/\b(create|drop) table (?:if (?:not )?exists )?public\.(\w+)/gi)) {
      if (verb?.toLowerCase() === 'create') tables.add(table);
      else tables.delete(table);
    }
  }
  return [...tables];
}

export function readMigrations(repoRoot: string): string[] {
  const dir = join(repoRoot, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'));
}

export function catalogProblems(parsed: readonly string[], catalog: readonly string[]): string[] {
  return [
    ...catalog.filter((table) => !parsed.includes(table)).map((table) => `public.${table} is in the database but seed-coverage.ts reads no migration that creates it`),
    ...parsed.filter((table) => !catalog.includes(table)).map((table) => `public.${table} is created by a migration but the database has no such table`),
  ];
}

function staleEntries(tables: readonly string[]): string[] {
  return [...Object.keys(SEED_EXEMPT), ...Object.keys(WRITTEN_BY_DATABASE)]
    .filter((table) => !tables.includes(table))
    .map((table) => `${table} is listed in seed-coverage.ts but no migration creates it`);
}

function householdsWithRows(seed: SeedTables): Map<string, Set<string>> {
  const covered = new Map<string, Set<string>>();
  for (const { table, rows } of seed.tables) {
    if (!table.startsWith('public.')) continue;
    const name = table.slice('public.'.length);
    const ids = rows.map((row) => (name === 'households' ? row.id : row.household_id)).filter((id) => typeof id === 'string');
    covered.set(name, new Set([...(covered.get(name) ?? []), ...ids]));
  }
  return covered;
}

export function generatorProblems(tables: readonly string[], seed: SeedTables): string[] {
  const covered = householdsWithRows(seed);
  const problems = tables.flatMap((table) => {
    if (table in SEED_EXEMPT) return [];
    const statement = WRITTEN_BY_DATABASE[table];
    if (statement !== undefined) return seed.tail.includes(statement) ? [] : [`public.${table}: the seed SQL no longer runs "${statement}"`];
    const ids = covered.get(table) ?? new Set();
    const missing = seed.households.filter((household) => !ids.has(householdId(household))).map(({ key }) => key);
    if (missing.length === 0) return [];
    return [`public.${table} has no seed rows ${missing.length === seed.households.length ? 'in any household' : `in ${missing.join(', ')}`}`];
  });
  return [...problems, ...staleEntries(tables)];
}

export type HouseholdCount = { readonly table: string; readonly household: string; readonly rows: number };

export function databaseProblems(tables: readonly string[], households: readonly string[], counts: readonly HouseholdCount[]): string[] {
  const problems = tables
    .filter((table) => !(table in SEED_EXEMPT) && table !== 'households')
    .flatMap((table) => {
      const empty = households.filter((household) => !counts.some((count) => count.table === table && count.household === household && count.rows > 0));
      return empty.length === 0 ? [] : [`public.${table} has no rows in ${empty.length} of ${households.length} households`];
    });
  return [...(households.length === 0 ? ['the database has no households; run pnpm db:reset'] : []), ...problems, ...staleEntries(tables)];
}

function countRows(workdir: string, tables: readonly string[]): { households: string[]; counts: HouseholdCount[] } {
  const households = query<{ id: string }>(workdir, 'select id::text as id from public.households order by id').map(({ id }) => id);
  const selects = tables
    .filter((table) => !(table in SEED_EXEMPT) && table !== 'households')
    .map((table) => `select '${table}' as table, household_id::text as household, count(*)::int as rows from public.${table} group by household_id`);
  return { households, counts: query<HouseholdCount>(workdir, selects.join('\nunion all\n')) };
}

function checkDatabase(workdir: string, parsed: readonly string[]): { tables: string[]; problems: string[] } {
  const tables = publicTables(workdir).map(({ name }) => name);
  const { households, counts } = countRows(workdir, tables);
  return { tables, problems: [...catalogProblems(parsed, tables), ...databaseProblems(tables, households, counts)] };
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  const parsed = migrationTables(readMigrations(repoRoot));
  const database = process.argv.includes('--database');
  const { tables, problems } = database
    ? checkDatabase(slotWorkdir(repoRoot, parseSlot(process.env.ESTA_SLOT)), parsed)
    : { tables: parsed, problems: generatorProblems(parsed, seedTables(DEFAULT_OPTIONS)) };
  for (const problem of problems) console.error(problem);
  const seeded = tables.filter((table) => !(table in SEED_EXEMPT)).length;
  if (problems.length === 0) console.log(`Seed coverage${database ? ' on the database' : ''}: ${seeded} business tables have rows in every household; ${tables.length - seeded} exempt.`);
  process.exit(problems.length === 0 ? 0 : 1);
}
