import 'server-only';
import {
  LEGAL_STATUSES,
  PROPERTY_KINDS,
  USE_MODES,
  applyPropertyFilters,
  preferPhrase,
  propertyStatus,
  searchTokens,
  type FilteredProperties,
  type PropertyFilters,
  type PropertyListRow,
  type PropertyStatusMark,
  type PropertyViewRow,
} from '@esta/core/properties';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { currentMonthlyRent } from '@esta/core/lease';
import { vnd, type Vnd } from '@esta/core/money';
import { leaseTerms } from '@esta/core/schemas/lease';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';
import { loadActiveLeases } from '@/server/leases/load';
import { loadCompleteness, type PropertyCompleteness } from './completeness';

export const PROPERTY_ROW_COLUMNS =
  'id, nickname, code, kind, use_mode, legal_status, cover_photo_path, address_line, commune_name, province_code, province_name, certificate_address_text, legacy_province_names, search_text, lat, lng, has_boundary, owner_party_ids, vacant_since, leased_unit_count, unit_count';

export const propertyRowSchema = z
  .object({
    id: z.string(),
    nickname: z.string(),
    code: z.string(),
    kind: z.enum(PROPERTY_KINDS),
    use_mode: z.enum(USE_MODES),
    legal_status: z.enum(LEGAL_STATUSES),
    cover_photo_path: z.string().nullable(),
    address_line: z.string().nullable(),
    commune_name: z.string().nullable(),
    province_code: z.string().nullable(),
    province_name: z.string().nullable(),
    certificate_address_text: z.string().nullable(),
    legacy_province_names: z.array(z.string()).nullable(),
    search_text: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    has_boundary: z.boolean(),
    owner_party_ids: z.array(z.string()).nullable(),
    vacant_since: z.string().refine(isIsoDate).nullable().catch(null),
    leased_unit_count: z.number().int().min(0).catch(0),
    unit_count: z.number().int().min(0).catch(0),
  })
  .transform(
    (row): PropertyViewRow => ({
      id: row.id,
      nickname: row.nickname,
      code: row.code,
      kind: row.kind,
      useMode: row.use_mode,
      legalStatus: row.legal_status,
      coverPhotoPath: row.cover_photo_path,
      addressLine: row.address_line,
      communeName: row.commune_name,
      provinceCode: row.province_code,
      provinceName: row.province_name,
      certificateAddressText: row.certificate_address_text,
      legacyProvinceNames: row.legacy_province_names ?? [],
      searchText: row.search_text ?? '',
      location: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
      hasBoundary: row.has_boundary,
      ownerPartyIds: row.owner_party_ids ?? [],
      monthlyRentVnd: null,
      vacantSince: row.vacant_since as IsoDate | null,
      leasedUnitCount: row.leased_unit_count,
      unitCount: row.unit_count,
    }),
  );

/** LIKE treats `%`, `_` and `\` as syntax and PostgREST reads `*` as `%`, so a typed one must match only itself. */
const likeToken = (token: string) => `%${token.replace(/[\\%_]/g, '\\$&').replaceAll('*', '')}%`;

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

async function readMatchingRows(supabase: SessionClient, householdId: string, tokens: readonly string[]): Promise<PropertyViewRow[]> {
  const rows: PropertyViewRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('property_list_rows').select(PROPERTY_ROW_COLUMNS).eq('household_id', householdId);
    for (const token of tokens) query = query.ilike('search_text', likeToken(token));
    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading the property list failed: ${error.message}`);
    rows.push(...z.array(propertyRowSchema).parse(data));
    if (data.length < PAGE_SIZE) return rows;
  }
}

export type PropertyList = FilteredProperties & {
  householdCount: number;
  provinceNames: ReadonlyMap<string, string>;
  ownerNames: ReadonlyMap<string, string>;
  /** Each shown row's `propertyStatus` marks on the Clock's date; a row with none is absent. */
  statuses: ReadonlyMap<string, readonly PropertyStatusMark[]>;
};

async function readOwnerNames(supabase: SessionClient, householdId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('parties').select('id, full_name').eq('household_id', householdId);
  if (error) throw new Error(`Reading owner names failed: ${error.message}`);
  return new Map(data.map((party) => [party.id, party.full_name]));
}

/** A property created between the two reads has no facts yet; it shows as complete until the next load. */
function summary(score: PropertyCompleteness | undefined): PropertyListRow['completeness'] {
  return score === undefined ? { percent: 100, missing: 0 } : { percent: score.percent, missing: score.failing.length };
}

/** The current monthly rent of each property's active leases, after escalation (amendments join in P3-08). */
async function activeRentByProperty(householdId: string, asOf: IsoDate): Promise<Map<string, Vnd>> {
  const rents = new Map<string, Vnd>();
  for (const lease of await loadActiveLeases(householdId)) {
    const terms = leaseTerms(lease);
    if (terms === null) continue;
    rents.set(lease.property_id, vnd((rents.get(lease.property_id) ?? 0) + currentMonthlyRent(terms, [], asOf)));
  }
  return rents;
}

/** RLS already limits the rows to the member's households; the household predicate keeps a member of two to one list. */
export async function listProperties(householdId: string, filters: PropertyFilters, asOf: IsoDate): Promise<PropertyList> {
  const supabase = await createSessionClient();
  const tokens = searchTokens(filters.q);
  const [viewRows, count, ownerNames, scores, rents] = await Promise.all([
    readMatchingRows(supabase, householdId, tokens),
    tokens.length === 0 ? null : supabase.from('property_list_rows').select('id', { count: 'exact', head: true }).eq('household_id', householdId),
    readOwnerNames(supabase, householdId),
    loadCompleteness(householdId),
    activeRentByProperty(householdId, asOf),
  ]);
  if (count?.error) throw new Error(`Counting properties failed: ${count.error.message}`);
  const rows = viewRows.map((row): PropertyListRow => ({ ...row, monthlyRentVnd: rents.get(row.id) ?? null, completeness: summary(scores.get(row.id)) }));
  const matches = preferPhrase(rows, tokens);
  const filtered = applyPropertyFilters(matches, filters);
  return {
    ...filtered,
    statuses: new Map(
      filtered.rows.flatMap((row) => {
        const marks = propertyStatus(row, asOf);
        return marks.length === 0 ? [] : [[row.id, marks] as const];
      }),
    ),
    householdCount: count?.count ?? rows.length,
    ownerNames,
    provinceNames: new Map(
      matches.flatMap((row) => (row.provinceCode === null || row.provinceName === null ? [] : [[row.provinceCode, row.provinceName] as const])),
    ),
  };
}
