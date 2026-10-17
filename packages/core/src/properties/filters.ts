import { z } from 'zod';
import { foldVietnamese } from '../search/fold';

export const PROPERTY_KINDS = [
  'townhouse', 'apartment', 'villa', 'rooming_house', 'commercial_space', 'warehouse',
  'residential_land', 'agricultural_land', 'mixed', 'other',
] as const;
export const USE_MODES = ['rental', 'owner_occupied', 'family_use', 'own_business', 'held', 'under_renovation'] as const;
export const LEGAL_STATUSES = ['certified', 'certificate_pending', 'paper_only', 'shared_certificate', 'in_dispute', 'unknown'] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];
export type UseMode = (typeof USE_MODES)[number];
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

/** One row of `property_list_rows`. `searchText` is `esta_unaccent` over the names and addresses. */
export type PropertyListRow = {
  id: string;
  nickname: string;
  code: string;
  kind: PropertyKind;
  useMode: UseMode;
  legalStatus: LegalStatus;
  coverPhotoPath: string | null;
  addressLine: string | null;
  communeName: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  certificateAddressText: string | null;
  legacyProvinceNames: readonly string[];
  searchText: string;
};

/** The name people say: "Thành phố Hồ Chí Minh" reads "TP. Hồ Chí Minh", "Tỉnh Bình Dương" reads "Bình Dương". */
export function shortProvinceName(name: string): string {
  return name.normalize('NFC').replace(/^Thành phố\s+/u, 'TP. ').replace(/^Tỉnh\s+/u, '');
}

const unprefixedProvinceName = (name: string) => name.normalize('NFC').replace(/^(Thành phố|Tỉnh)\s+/u, '');
const bareProvinceName = (name: string) => foldVietnamese(unprefixedProvinceName(name));

function isSameProvince(legacyName: string, currentName: string | null): boolean {
  return currentName !== null && bareProvinceName(legacyName) === bareProvinceName(currentName);
}

type FilterDefinition = {
  readonly schema: z.ZodType<string>;
  /** The values a row carries for this filter; a row matches a chosen value when the list holds it. */
  readonly values: (row: PropertyListRow) => readonly string[];
};

/**
 * `province` takes a current province code (`79`) or a pre-2025 province name (`Tỉnh Bình Dương`). A former
 * province is offered only where it differs from the row's current one, so Bình Dương shows and Lâm Đồng does not.
 */
export const PROPERTY_FILTERS = {
  province: {
    schema: z.union([z.string().regex(/^[0-9]{2}$/), z.string().trim().min(2).max(80).regex(/^\p{L}[\p{L}\p{Pd} .']*$/u)]),
    values: (row) => [
      ...(row.provinceCode === null ? [] : [row.provinceCode]),
      ...row.legacyProvinceNames.filter((name) => !isSameProvince(name, row.provinceName)),
    ],
  },
  kind: { schema: z.enum(PROPERTY_KINDS), values: (row) => [row.kind] },
  use: { schema: z.enum(USE_MODES), values: (row) => [row.useMode] },
  legal: { schema: z.enum(LEGAL_STATUSES), values: (row) => [row.legalStatus] },
} as const satisfies Record<string, FilterDefinition>;

export type PropertyFilterKey = keyof typeof PROPERTY_FILTERS;
export const PROPERTY_FILTER_KEYS = Object.keys(PROPERTY_FILTERS) as readonly PropertyFilterKey[];

const collator = new Intl.Collator('vi', { numeric: true });

type Compare = (a: PropertyListRow, b: PropertyListRow) => number;

const byNickname: Compare = (a, b) => collator.compare(a.nickname, b.nickname);

/** Provinces by the name people say, so Đồng Nai comes before Hồ Chí Minh; a property with no province goes last. */
const byProvince: Compare = (a, b) => {
  if (a.provinceName === null || b.provinceName === null) return Number(a.provinceName === null) - Number(b.provinceName === null);
  return collator.compare(unprefixedProvinceName(a.provinceName), unprefixedProvinceName(b.provinceName));
};

export const PROPERTY_SORTS = {
  name: byNickname,
  area: (a, b) => byProvince(a, b) || byNickname(a, b),
} as const satisfies Record<string, Compare>;

export type PropertySortKey = keyof typeof PROPERTY_SORTS;
export const PROPERTY_SORT_KEYS = Object.keys(PROPERTY_SORTS) as readonly PropertySortKey[];

export type PropertyFilters = { q: string; sort: PropertySortKey } & { [K in PropertyFilterKey]: string | null };

export type SearchParamsRecord = Readonly<Record<string, string | readonly string[] | undefined>>;

const MAX_QUERY_LENGTH = 100;

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

/** A value the registry does not know is dropped, never an error. */
export function parsePropertyFilters(params: SearchParamsRecord): PropertyFilters {
  const filters = Object.fromEntries(
    PROPERTY_FILTER_KEYS.map((key) => {
      const parsed = PROPERTY_FILTERS[key].schema.safeParse(first(params[key]));
      return [key, parsed.success ? parsed.data : null];
    }),
  ) as { [K in PropertyFilterKey]: string | null };
  const sort = first(params.sort);
  return {
    q: (first(params.q) ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH),
    sort: PROPERTY_SORT_KEYS.find((key) => key === sort) ?? 'name',
    ...filters,
  };
}

export function propertyFiltersQuery(filters: PropertyFilters): string {
  const pairs: [string, string][] = [
    ['q', filters.q],
    ...PROPERTY_FILTER_KEYS.map((key): [string, string] => [key, filters[key] ?? '']),
    ['sort', filters.sort === 'name' ? '' : filters.sort],
  ];
  const query = pairs
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return query === '' ? '' : `?${query}`;
}

/** Folded words of a query, matching how `property_list_rows.search_text` folds names and drops commas. */
export function searchTokens(query: string): string[] {
  return foldVietnamese(query.normalize('NFC'))
    .replace(/[\s,;]+/g, ' ')
    .split(' ')
    .filter((token) => token !== '');
}

/**
 * Every token must match, so `nguyen an ninh di an` finds a street and a ward together. When some rows also hold the
 * whole query as one phrase, only those stay: `binh duong` then means the province, not a Bình ward on some Đường.
 */
export function preferPhrase<Row extends Pick<PropertyListRow, 'searchText'>>(rows: readonly Row[], tokens: readonly string[]): readonly Row[] {
  if (tokens.length < 2) return rows;
  const phrase = tokens.join(' ');
  const exact = rows.filter((row) => row.searchText.includes(phrase));
  return exact.length > 0 ? exact : rows;
}

export type FilterTally = { all: number; values: ReadonlyMap<string, number> };

export type FilteredProperties = {
  rows: readonly PropertyListRow[];
  tallies: { readonly [K in PropertyFilterKey]: FilterTally };
};

function matchesFilter(row: PropertyListRow, key: PropertyFilterKey, value: string | null): boolean {
  return value === null || PROPERTY_FILTERS[key].values(row).includes(value);
}

/**
 * Applies the registry to rows that already match the search. Each filter's tally counts the rows that pass every
 * other filter, so a chip's number is what picking it would show.
 */
export function applyPropertyFilters(rows: readonly PropertyListRow[], filters: PropertyFilters): FilteredProperties {
  const tally = (key: PropertyFilterKey): FilterTally => {
    const others = rows.filter((row) => PROPERTY_FILTER_KEYS.every((other) => other === key || matchesFilter(row, other, filters[other])));
    const values = new Map<string, number>();
    for (const row of others) {
      for (const value of new Set(PROPERTY_FILTERS[key].values(row))) values.set(value, (values.get(value) ?? 0) + 1);
    }
    return { all: others.length, values };
  };
  const tallies = { province: tally('province'), kind: tally('kind'), use: tally('use'), legal: tally('legal') };
  const kept = rows.filter((row) => PROPERTY_FILTER_KEYS.every((key) => matchesFilter(row, key, filters[key])));
  return { rows: kept.toSorted(PROPERTY_SORTS[filters.sort]), tallies };
}
