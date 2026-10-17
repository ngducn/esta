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
} from '@esta/core/properties';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export const PROPERTY_ROW_COLUMNS =
  'id, nickname, code, kind, use_mode, legal_status, cover_photo_path, address_line, commune_name, province_code, province_name, certificate_address_text, legacy_province_names, search_text, lat, lng, has_boundary, owner_party_ids, monthly_rent_vnd, vacant_since';

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
    monthly_rent_vnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    vacant_since: z.string().refine(isIsoDate).nullable(),
  })
  .transform(
    (row): PropertyListRow => ({
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
      monthlyRentVnd: row.monthly_rent_vnd === null ? null : vnd(row.monthly_rent_vnd),
      vacantSince: row.vacant_since as IsoDate | null,
    }),
  );

/** LIKE treats `%`, `_` and `\` as syntax and PostgREST reads `*` as `%`, so a typed one must match only itself. */
const likeToken = (token: string) => `%${token.replace(/[\\%_]/g, '\\$&').replaceAll('*', '')}%`;

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

async function readMatchingRows(supabase: SessionClient, householdId: string, tokens: readonly string[]): Promise<PropertyListRow[]> {
  const rows: PropertyListRow[] = [];
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
  /** Each shown row's `propertyStatus` mark on the Clock's date; a row with none is absent. */
  statuses: ReadonlyMap<string, PropertyStatusMark>;
};

async function readOwnerNames(supabase: SessionClient, householdId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('parties').select('id, full_name').eq('household_id', householdId);
  if (error) throw new Error(`Reading owner names failed: ${error.message}`);
  return new Map(data.map((party) => [party.id, party.full_name]));
}

/** RLS already limits the rows to the member's households; the household predicate keeps a member of two to one list. */
export async function listProperties(householdId: string, filters: PropertyFilters, asOf: IsoDate): Promise<PropertyList> {
  const supabase = await createSessionClient();
  const tokens = searchTokens(filters.q);
  const [rows, count, ownerNames] = await Promise.all([
    readMatchingRows(supabase, householdId, tokens),
    tokens.length === 0 ? null : supabase.from('property_list_rows').select('id', { count: 'exact', head: true }).eq('household_id', householdId),
    readOwnerNames(supabase, householdId),
  ]);
  if (count?.error) throw new Error(`Counting properties failed: ${count.error.message}`);
  const matches = preferPhrase(rows, tokens);
  const filtered = applyPropertyFilters(matches, filters);
  return {
    ...filtered,
    statuses: new Map(
      filtered.rows.flatMap((row) => {
        const mark = propertyStatus(row, asOf);
        return mark === null ? [] : [[row.id, mark] as const];
      }),
    ),
    householdCount: count?.count ?? rows.length,
    ownerNames,
    provinceNames: new Map(
      matches.flatMap((row) => (row.provinceCode === null || row.provinceName === null ? [] : [[row.provinceCode, row.provinceName] as const])),
    ),
  };
}
