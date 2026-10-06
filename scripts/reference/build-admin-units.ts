import type { SheetRow, SoapRecord } from './sources.ts';

export type AdminUnitKind = 'province' | 'city' | 'ward' | 'commune' | 'special_zone';
export type MergeKind = 'whole' | 'partial';

export type AdminUnit = {
  code: string;
  name: string;
  kind: AdminUnitKind;
  parentCode: string | null;
};

export type LegacyLink = {
  oldProvinceCode: string;
  oldProvinceName: string;
  oldDistrictCode: string;
  oldDistrictName: string;
  oldCommuneCode: string | null;
  oldCommuneName: string | null;
  newCommuneCode: string;
  mergeKind: MergeKind;
  source: string;
};

export type CuratedLink =
  | { fix: 'add'; link: LegacyLink }
  | { fix: 'recode'; tableOldCommuneCode: string; link: LegacyLink };

export type RawSources = {
  provinces: readonly SoapRecord[];
  communes: readonly SoapRecord[];
  conversion: readonly SheetRow[];
  curated: readonly CuratedLink[];
};

export const CONVERSION_SOURCE = 'nso_bang_chuyen_doi_2025';

const KIND_BY_CATALOG_TYPE: Readonly<Record<string, AdminUnitKind>> = {
  'Thành phố Trung ương': 'city',
  Tỉnh: 'province',
  Phường: 'ward',
  Xã: 'commune',
  'Đặc khu': 'special_zone',
};

const CONVERSION_HEADER = [
  'Tỉnh, thành phố',
  'Tên Xã mới',
  'Mã Xã mới',
  'Tên Xã cũ',
  'Mã Xã cũ',
  'Ghi chú',
  'Quận/huyện',
  'Tỉnh cũ',
];

const PARTIAL_NOTES = ['một phần', 'phần còn lại'];

export function collapseWhitespace(text: string): string {
  return text.normalize('NFC').split(/\s+/).filter(Boolean).join(' ');
}

function field(record: SoapRecord, name: string): string {
  const value = record[name];
  if (value === undefined || value.trim() === '') throw new Error(`catalog record has no ${name}: ${JSON.stringify(record)}`);
  return collapseWhitespace(value);
}

function kindOf(record: SoapRecord): AdminUnitKind {
  const type = field(record, 'LoaiHinh');
  const kind = KIND_BY_CATALOG_TYPE[type];
  if (kind === undefined) throw new Error(`unknown catalog unit type ${type}`);
  return kind;
}

function code(value: string | null | undefined, width: number): string {
  const digits = (value ?? '').trim();
  if (!/^\d+$/.test(digits) || digits.length > width) throw new Error(`bad unit code ${JSON.stringify(value)}`);
  return digits.padStart(width, '0');
}

function splitCoded(text: string | null | undefined, width: number): { name: string; code: string } {
  const match = /^(.*?)\s*\((\d+)\)\s*$/s.exec(text ?? '');
  if (match === null) throw new Error(`expected "Name (code)", got ${JSON.stringify(text)}`);
  return { name: collapseWhitespace(match[1] ?? ''), code: code(match[2], width) };
}

export function mergeKindOf(note: string | null | undefined): MergeKind {
  const folded = collapseWhitespace(note ?? '').toLowerCase();
  return PARTIAL_NOTES.some((marker) => folded.includes(marker)) ? 'partial' : 'whole';
}

function linkKey(link: LegacyLink): string {
  return `${link.oldDistrictCode}|${link.oldCommuneCode ?? ''}|${link.newCommuneCode}`;
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareLinks(a: LegacyLink, b: LegacyLink): number {
  return (
    compareText(a.oldProvinceCode, b.oldProvinceCode) ||
    compareText(a.oldDistrictCode, b.oldDistrictCode) ||
    compareText(a.oldCommuneCode ?? '', b.oldCommuneCode ?? '') ||
    compareText(a.newCommuneCode, b.newCommuneCode)
  );
}

function buildUnits(provinces: readonly SoapRecord[], communes: readonly SoapRecord[]): AdminUnit[] {
  const units: AdminUnit[] = [
    ...provinces.map((record) => ({
      code: code(field(record, 'MaTinh'), 2),
      name: field(record, 'TenTinh'),
      kind: kindOf(record),
      parentCode: null,
    })),
    ...communes.map((record) => ({
      code: code(field(record, 'MaPhuongXa'), 5),
      name: field(record, 'TenPhuongXa'),
      kind: kindOf(record),
      parentCode: code(field(record, 'MaTinh'), 2),
    })),
  ];
  const provinceCodes = new Set(units.filter((unit) => unit.parentCode === null).map((unit) => unit.code));
  for (const unit of units) {
    if ((unit.parentCode === null) !== (unit.kind === 'province' || unit.kind === 'city')) {
      throw new Error(`unit ${unit.code} is a ${unit.kind} at the wrong level`);
    }
    if (unit.parentCode !== null && !provinceCodes.has(unit.parentCode)) {
      throw new Error(`unit ${unit.code} names a missing province ${unit.parentCode}`);
    }
  }
  if (new Set(units.map((unit) => unit.code)).size !== units.length) throw new Error('catalog repeats a unit code');
  return units.sort(
    (a, b) => Number(a.parentCode !== null) - Number(b.parentCode !== null) || compareText(a.code, b.code),
  );
}

type ConversionLine = {
  newCommuneCode: string;
  oldCommuneCode: string | null;
  oldCommuneName: string | null;
  note: string | null;
  district: { name: string; code: string };
  province: { name: string; code: string };
};

function readConversion(rows: readonly SheetRow[]): ConversionLine[] {
  const header = rows[1]?.slice(0, CONVERSION_HEADER.length).map((cell) => collapseWhitespace(cell ?? ''));
  if (header?.join('|') !== CONVERSION_HEADER.join('|')) {
    throw new Error(`conversion table header changed: ${JSON.stringify(header)}`);
  }
  return rows
    .slice(2)
    .filter((row) => row[2] != null)
    .map((row) => {
      const oldName = collapseWhitespace(row[3] ?? '');
      return {
        newCommuneCode: code(row[2], 5),
        oldCommuneCode: row[4] == null ? null : code(row[4], 5),
        oldCommuneName: oldName === '' ? null : oldName,
        note: row[5] ?? null,
        district: splitCoded(row[6], 3),
        province: splitCoded(row[7], 2),
      };
    });
}

function majority(pairs: Iterable<readonly [string, string]>): Map<string, string> {
  const tallies = new Map<string, Map<string, number>>();
  for (const [key, value] of pairs) {
    const tally = tallies.get(key) ?? new Map<string, number>();
    tallies.set(key, tally);
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  return new Map(
    [...tallies].map(([key, tally]) => [key, [...tally].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]]),
  );
}

/**
 * A few NSO table rows name the wrong province or spell its name differently, so the district
 * takes the province most of its rows name, and the province takes the name most rows give it.
 */
function provinceByDistrict(lines: readonly ConversionLine[]): Map<string, { name: string; code: string }> {
  const provinceCodes = majority(lines.map((line) => [line.district.code, line.province.code]));
  const provinceNames = majority(lines.map((line) => [line.province.code, line.province.name]));
  return new Map(
    [...provinceCodes].map(([district, province]) => [district, { code: province, name: provinceNames.get(province) ?? '' }]),
  );
}

function applyCurated(links: LegacyLink[], curated: readonly CuratedLink[]): LegacyLink[] {
  const result = [...links];
  for (const entry of curated) {
    const { link } = entry;
    if (entry.fix === 'recode') {
      const hits = result.flatMap((candidate, index) =>
        candidate.oldDistrictCode === link.oldDistrictCode &&
        candidate.oldCommuneName === link.oldCommuneName &&
        candidate.newCommuneCode === link.newCommuneCode &&
        candidate.oldCommuneCode === entry.tableOldCommuneCode
          ? [index]
          : [],
      );
      const [hit] = hits;
      if (hits.length !== 1 || hit === undefined) {
        throw new Error(`recode of ${link.oldCommuneName} (${entry.tableOldCommuneCode}) matches ${hits.length} table rows`);
      }
      const table: LegacyLink | undefined = result[hit];
      const fields = Object.keys(link) as (keyof LegacyLink)[];
      if (fields.some((key) => key !== 'oldCommuneCode' && key !== 'source' && table?.[key] !== link[key])) {
        throw new Error(`recode of ${link.oldCommuneName} changes more than the code: ${JSON.stringify(table)}`);
      }
      result[hit] = link;
    } else {
      if (result.some((candidate) => linkKey(candidate) === linkKey(link))) {
        throw new Error(`curated row duplicates a table row: ${linkKey(link)}`);
      }
      result.push(link);
    }
  }
  return result;
}

export function buildAdminUnits(raw: RawSources): { units: AdminUnit[]; legacy: LegacyLink[] } {
  const units = buildUnits(raw.provinces, raw.communes);
  const lines = readConversion(raw.conversion);
  const provinces = provinceByDistrict(lines);

  const tableLinks = lines.map((line): LegacyLink => {
    const province = provinces.get(line.district.code) ?? line.province;
    return {
      oldProvinceCode: province.code,
      oldProvinceName: province.name,
      oldDistrictCode: line.district.code,
      oldDistrictName: line.district.name,
      oldCommuneCode: line.oldCommuneCode,
      oldCommuneName: line.oldCommuneName,
      newCommuneCode: line.newCommuneCode,
      mergeKind: mergeKindOf(line.note),
      source: CONVERSION_SOURCE,
    };
  });
  const legacy = applyCurated(tableLinks, raw.curated).sort(compareLinks);

  const keys = new Set<string>();
  for (const link of legacy) {
    if (keys.has(linkKey(link))) throw new Error(`legacy link repeats: ${linkKey(link)}`);
    keys.add(linkKey(link));
    if (link.oldCommuneCode !== null && link.oldCommuneName === null) {
      throw new Error(`legacy link has a commune code without a name: ${linkKey(link)}`);
    }
  }
  const communeCodes = new Set(units.filter((unit) => unit.parentCode !== null).map((unit) => unit.code));
  const missing = [...new Set(legacy.map((link) => link.newCommuneCode))].filter((target) => !communeCodes.has(target));
  if (missing.length > 0) throw new Error(`legacy links target units missing from the catalog: ${missing.join(', ')}`);
  const linked = new Set(legacy.map((link) => link.newCommuneCode));
  const unlinked = [...communeCodes].filter((target) => !linked.has(target));
  if (unlinked.length > 0) throw new Error(`current units with no legacy link: ${unlinked.join(', ')}`);

  return { units, legacy };
}
