import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES } from './tables';

const GENERATED_COLUMNS: Readonly<Record<string, readonly string[]>> = { documents: ['search_vector'] };

/** Every table and its Row columns from the generated types, the way `pnpm db:types` wrote them. */
function generatedTables(): ReadonlyMap<string, readonly string[]> {
  const source = readFileSync(new URL('../../../db/src/database.types.ts', import.meta.url), 'utf8');
  const publicSchema = source.slice(source.indexOf('  public: {'));
  const tables = publicSchema.slice(publicSchema.indexOf('Tables: {'), publicSchema.indexOf('Views: {'));
  const found = new Map<string, readonly string[]>();
  for (const match of tables.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}\n {8}Insert/gm)) {
    found.set(match[1] ?? '', [...(match[2] ?? '').matchAll(/^ {10}(\w+):/gm)].map((column) => column[1] ?? ''));
  }
  return found;
}

describe('EXPORT_TABLES', () => {
  const generated = generatedTables();
  const householdTables = [...generated].filter(([name, columns]) => name === 'households' || columns.includes('household_id'));

  it('reads the generated types, so the check below is not vacuous', () => {
    expect(householdTables.length).toBeGreaterThan(30);
  });

  it('holds every household table of the generated types and nothing else', () => {
    expect(EXPORT_TABLES.map((table) => table.name).sort()).toEqual(householdTables.map(([name]) => name).sort());
  });

  it('lists every column of each table except the ones the database generates', () => {
    for (const table of EXPORT_TABLES) {
      const expected = (generated.get(table.name) ?? []).filter((column) => !GENERATED_COLUMNS[table.name]?.includes(column));
      expect([...table.columns].sort(), table.name).toEqual([...expected].sort());
    }
  });

  it('lists a table after each parent it points at', () => {
    const position = new Map(EXPORT_TABLES.map((table, index) => [table.name, index]));
    for (const table of EXPORT_TABLES) {
      for (const parent of table.parents) expect(position.get(parent), `${parent} before ${table.name}`).toBeLessThan(position.get(table.name) ?? -1);
    }
  });

  it('starts at the household and names each table once', () => {
    expect(EXPORT_TABLES[0]?.name).toBe('households');
    expect(new Set(EXPORT_TABLES.map((table) => table.name)).size).toBe(EXPORT_TABLES.length);
  });
});
