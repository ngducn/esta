import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareText } from './build-admin-units.ts';
import { parseCsv, type CsvRecord } from './csv.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
const seedDir = join(repoRoot, 'supabase', 'seed', 'reference');
const migration = join(repoRoot, 'supabase', 'migrations', '20261007006100_reference_data.sql');
const CHUNK = 500;

type Column = { name: string; nullable?: boolean; cast?: string };

const inputs = new Map<string, string>();

function read(name: string): string {
  const text = readFileSync(join(seedDir, name), 'utf8');
  inputs.set(name, text);
  return text;
}

function csv(name: string, columns: readonly string[]): CsvRecord[] {
  return parseCsv(read(name), columns);
}

function literal(value: string | null, cast?: string): string {
  if (value === null) return 'null';
  return `'${value.replaceAll("'", "''")}'${cast === undefined ? '' : `::${cast}`}`;
}

function insert(table: string, columns: readonly Column[], rows: readonly CsvRecord[]): string {
  const statements: string[] = [];
  for (let start = 0; start < rows.length; start += CHUNK) {
    const values = rows.slice(start, start + CHUNK).map((row) => {
      const cells = columns.map((column) => {
        const value = row[column.name];
        if (value === undefined) throw new Error(`${table} row has no ${column.name}`);
        if (value === '' && !column.nullable) throw new Error(`${table}.${column.name} is empty in ${JSON.stringify(row)}`);
        return literal(value === '' ? null : value, column.cast);
      });
      return `  (${cells.join(', ')})`;
    });
    statements.push(`insert into public.${table} (${columns.map((column) => column.name).join(', ')}) values\n${values.join(',\n')};`);
  }
  return statements.join('\n\n');
}

function sortedBy(rows: CsvRecord[], ...keys: ((row: CsvRecord) => string)[]): CsvRecord[] {
  return rows.sort((a, b) => keys.reduce((order, key) => order || compareText(key(a), key(b)), 0));
}

const units = sortedBy(
  csv('admin_units.csv', ['code', 'name', 'kind', 'parent_code', 'effective_from']),
  (row) => (row.parent_code === '' ? '0' : '1'),
  (row) => row.code ?? '',
);

const legacyColumns = [
  'old_province_code',
  'old_province_name',
  'old_district_code',
  'old_district_name',
  'old_commune_code',
  'old_commune_name',
  'new_commune_code',
  'merge_kind',
  'source',
];
const legacy = sortedBy(
  csv('admin_unit_legacy_map.csv', legacyColumns),
  (row) => row.old_province_code ?? '',
  (row) => row.old_district_code ?? '',
  (row) => row.old_commune_code ?? '',
  (row) => row.new_commune_code ?? '',
);

const landUse = sortedBy(csv('land_use_codes.csv', ['code', 'name_vi', 'name_en', 'land_group']), (row) => row.code ?? '');

const shortNames = new Map(csv('bank_short_names.csv', ['bin', 'short_name']).map((row) => [row.bin, row.short_name ?? '']));
const banks = sortedBy(csv('napas_bins.csv', ['bin', 'name', 'code']), (row) => row.bin ?? '').map((row) => ({
  bin: row.bin ?? '',
  name: row.name ?? '',
  napas_code: row.code ?? '',
  short_name: shortNames.get(row.bin) ?? '',
}));
const unknownShortNames = [...shortNames.keys()].filter((bin) => !banks.some((bank) => bank.bin === bin));
if (unknownShortNames.length > 0) throw new Error(`bank_short_names.csv names BINs NAPAS does not list: ${unknownShortNames.join(', ')}`);

type TaxRule = {
  kind: string;
  effective_from: string;
  effective_to: string | null;
  params: Record<string, unknown>;
  source_citation: string;
  note: string | null;
};
const taxRules = (JSON.parse(read('tax_rules.json')) as TaxRule[]).map((rule) => ({
  kind: rule.kind,
  effective_from: rule.effective_from,
  effective_to: rule.effective_to ?? '',
  params: JSON.stringify(rule.params),
  source_citation: rule.source_citation,
  note: rule.note ?? '',
}));

const body = [
  insert(
    'admin_units',
    [{ name: 'code' }, { name: 'name' }, { name: 'kind' }, { name: 'parent_code', nullable: true }, { name: 'effective_from' }],
    units,
  ),
  insert(
    'admin_unit_legacy_map',
    legacyColumns.map((name) => ({ name, nullable: name === 'old_commune_code' || name === 'old_commune_name' })),
    legacy,
  ),
  insert('land_use_codes', [{ name: 'code' }, { name: 'name_vi' }, { name: 'name_en' }, { name: 'land_group' }], landUse),
  insert('bank_bins', [{ name: 'bin' }, { name: 'name' }, { name: 'napas_code' }, { name: 'short_name', nullable: true }], banks),
  insert(
    'tax_rules',
    [
      { name: 'kind' },
      { name: 'effective_from' },
      { name: 'effective_to', nullable: true },
      { name: 'params', cast: 'jsonb' },
      { name: 'source_citation' },
      { name: 'note', nullable: true },
    ],
    taxRules,
  ),
];

const sums = [...inputs]
  .sort(([a], [b]) => compareText(a, b))
  .map(([name, text]) => `${createHash('sha256').update(text).digest('hex')}  ${name}`);

const header = [
  '-- Generated by scripts/reference/build-migration.ts from supabase/seed/reference. Do not edit.',
  '-- Rebuild with `node scripts/reference/build-csvs.ts && node scripts/reference/build-migration.ts`.',
  '-- Inputs (SHA-256):',
  ...sums.map((line) => `--   ${line}`),
];

writeFileSync(migration, `${header.join('\n')}\n\n${body.join('\n\n')}\n`);
writeFileSync(join(seedDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
console.log(`wrote ${migration}`);
