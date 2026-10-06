import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAdminUnits,
  collapseWhitespace,
  compareText,
  type CuratedLink,
  type LegacyLink,
  type MergeKind,
} from './build-admin-units.ts';
import { formatCsv, parseCsv, type CsvRecord } from './csv.ts';
import { readSoapTable, readXlsxSheet } from './sources.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
const dataDir = join(import.meta.dirname, 'data');
const seedDir = join(repoRoot, 'supabase', 'seed', 'reference');

const REFORM_DATE = '2025-07-01';

const LEGACY_COLUMNS = [
  'old_province_code',
  'old_province_name',
  'old_district_code',
  'old_district_name',
  'old_commune_code',
  'old_commune_name',
  'new_commune_code',
  'merge_kind',
  'source',
] as const;
const CURATED_COLUMNS = ['fix', 'table_old_commune_code', ...LEGACY_COLUMNS] as const;

function readPinned(name: string): Buffer {
  const sums = readFileSync(join(dataDir, 'SHA256SUMS'), 'utf8');
  const pinned = new RegExp(`^([0-9a-f]{64})  ${name.replaceAll('.', '\\.')}$`, 'm').exec(sums)?.[1];
  const file = readFileSync(join(dataDir, name));
  const actual = createHash('sha256').update(file).digest('hex');
  if (pinned !== actual) throw new Error(`${name} has SHA-256 ${actual}, pinned ${pinned ?? 'nothing'}`);
  return file;
}

function mergeKind(text: string | undefined): MergeKind {
  if (text === 'whole' || text === 'partial') return text;
  throw new Error(`bad merge_kind ${JSON.stringify(text)}`);
}

function legacyFromRecord(record: CsvRecord): LegacyLink {
  const text = (column: (typeof LEGACY_COLUMNS)[number]) => record[column] ?? '';
  return {
    oldProvinceCode: text('old_province_code'),
    oldProvinceName: text('old_province_name'),
    oldDistrictCode: text('old_district_code'),
    oldDistrictName: text('old_district_name'),
    oldCommuneCode: text('old_commune_code') || null,
    oldCommuneName: text('old_commune_name') || null,
    newCommuneCode: text('new_commune_code'),
    mergeKind: mergeKind(record.merge_kind),
    source: text('source'),
  };
}

function legacyToRecord(link: LegacyLink): CsvRecord {
  return {
    old_province_code: link.oldProvinceCode,
    old_province_name: link.oldProvinceName,
    old_district_code: link.oldDistrictCode,
    old_district_name: link.oldDistrictName,
    old_commune_code: link.oldCommuneCode ?? '',
    old_commune_name: link.oldCommuneName ?? '',
    new_commune_code: link.newCommuneCode,
    merge_kind: link.mergeKind,
    source: link.source,
  };
}

function curatedFromRecord(record: CsvRecord): CuratedLink {
  const link = legacyFromRecord(record);
  if (record.fix === 'add') return { fix: 'add', link };
  if (record.fix === 'recode' && record.table_old_commune_code) {
    return { fix: 'recode', tableOldCommuneCode: record.table_old_commune_code, link };
  }
  throw new Error(`bad curated row ${JSON.stringify(record)}`);
}

type NapasBank = { bin: string; name: string; code: string };

function readNapasBins(json: string): NapasBank[] {
  const parsed: unknown = JSON.parse(json);
  const items = (parsed as { items?: unknown }).items;
  const total = (parsed as { totalItems?: unknown }).totalItems;
  if (!Array.isArray(items) || items.length !== total) throw new Error('NAPAS snapshot is not one complete page of items');
  return items
    .map((item: unknown): NapasBank => {
      const { bin, name, code } = item as Record<string, unknown>;
      if (typeof bin !== 'string' || !/^\d{6}$/.test(bin) || typeof name !== 'string' || typeof code !== 'string') {
        throw new Error(`bad NAPAS item ${JSON.stringify(item)}`);
      }
      return { bin, name: collapseWhitespace(name), code: collapseWhitespace(code) };
    })
    .sort((a, b) => compareText(a.bin, b.bin));
}

const curated = parseCsv(readFileSync(join(seedDir, 'legacy_curated.csv'), 'utf8'), CURATED_COLUMNS).map(curatedFromRecord);
const { units, legacy } = buildAdminUnits({
  provinces: readSoapTable(readPinned('nso_tinh.xml').toString('utf8')),
  communes: readSoapTable(readPinned('nso_phuong_xa.xml').toString('utf8')),
  conversion: readXlsxSheet(readPinned('nso_bang_chuyen_doi.xlsx'), 1),
  curated,
});
const banks = readNapasBins(readPinned('napas_bins.json').toString('utf8'));

writeFileSync(
  join(seedDir, 'admin_units.csv'),
  formatCsv(
    ['code', 'name', 'kind', 'parent_code', 'effective_from'],
    units.map((unit) => ({
      code: unit.code,
      name: unit.name,
      kind: unit.kind,
      parent_code: unit.parentCode ?? '',
      effective_from: REFORM_DATE,
    })),
  ),
);
writeFileSync(join(seedDir, 'admin_unit_legacy_map.csv'), formatCsv(LEGACY_COLUMNS, legacy.map(legacyToRecord)));
writeFileSync(join(seedDir, 'napas_bins.csv'), formatCsv(['bin', 'name', 'code'], banks));

console.log(`admin_units.csv: ${units.length} units`);
console.log(`admin_unit_legacy_map.csv: ${legacy.length} links`);
console.log(`napas_bins.csv: ${banks.length} banks`);
