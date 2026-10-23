import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, seedTables, type SeedTables } from '../supabase/seed/generator/index.ts';
import { householdId } from '../supabase/seed/generator/households.ts';
import { databaseProblems, generatorProblems, migrationTables, readMigrations, SEED_EXEMPT, WRITTEN_BY_DATABASE } from './seed-coverage.ts';

const repoRoot = new URL('..', import.meta.url).pathname;
const tables = migrationTables(readMigrations(repoRoot));
const seed = seedTables(DEFAULT_OPTIONS);
const known = [...Object.keys(SEED_EXEMPT), ...Object.keys(WRITTEN_BY_DATABASE)];

function without(table: string, keep: (row: Readonly<Record<string, unknown>>) => boolean = () => false): SeedTables {
  return { ...seed, tables: seed.tables.map((rows) => (rows.table === `public.${table}` ? { ...rows, rows: rows.rows.filter(keep) } : rows)) };
}

describe('migrationTables', () => {
  it('reads created tables in order and forgets dropped ones', () => {
    const sql = ['create table public.a (id int);\ncreate table if not exists public.b ();', 'drop table if exists public.a;\nCREATE TABLE public.c ();'];
    expect(migrationTables(sql)).toEqual(['b', 'c']);
  });

  it('finds the money and seed tables at this head', () => {
    expect(tables).toEqual(expect.arrayContaining(['expenses', 'owner_tax_inputs', 'valuations', 'invoices', 'payments', 'meter_readings']));
  });
});

describe('generatorProblems', () => {
  it('passes the full seed', () => {
    expect(generatorProblems(tables, seed)).toEqual([]);
  });

  it('fails a business table the generator leaves empty', () => {
    expect(generatorProblems(tables, without('valuations'))).toEqual(['public.valuations has no seed rows in any household']);
  });

  it('names the household a table misses', () => {
    const lane = seed.households.find(({ key }) => key === 'lane-3');
    if (lane === undefined) throw new Error('the default seed has lane 3');
    const lane3 = householdId(lane);
    expect(generatorProblems(tables, without('expenses', (row) => row.household_id !== lane3))).toEqual(['public.expenses has no seed rows in lane-3']);
  });

  it('fails a table the database no longer writes, and a new table nobody seeds or exempts', () => {
    expect(generatorProblems([...tables, 'rent_reviews'], { ...seed, tail: seed.tail.replaceAll('insert into public.payments', '') })).toEqual([
      'public.payments: the seed SQL no longer runs "insert into public.payments"',
      'public.rent_reviews has no seed rows in any household',
    ]);
  });

  it('fails an exemption or a database table no migration creates', () => {
    expect(generatorProblems(tables.filter((table) => table !== 'agent_items'), seed)).toEqual(['agent_items is listed in seed-coverage.ts but no migration creates it']);
  });

  it('gives every exemption a reason', () => {
    expect(known.every((table) => tables.includes(table))).toBe(true);
    expect(Object.values(SEED_EXEMPT).every((reason) => reason.trim().length > 10)).toBe(true);
  });
});

describe('databaseProblems', () => {
  const households = ['h1', 'h2'];
  const full = tables.filter((table) => !(table in SEED_EXEMPT) && table !== 'households').flatMap((table) => households.map((household) => ({ table, household, rows: 3 })));

  it('passes when every business table has rows in every household', () => {
    expect(databaseProblems(tables, households, full)).toEqual([]);
  });

  it('fails a table empty in one household, and a database with no households', () => {
    const counts = full.filter((count) => !(count.table === 'invoices' && count.household === 'h2'));
    expect(databaseProblems(tables, households, counts)).toEqual(['public.invoices has no rows in 1 of 2 households']);
    expect(databaseProblems(tables, [], [])[0]).toBe('the database has no households; run pnpm db:reset');
  });
});
