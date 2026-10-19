import { isIsoDate, type IsoDate } from '@esta/core/date';
import { LEGAL_STATUSES, PROPERTY_KINDS, USE_MODES, preferPhrase, type PropertyViewRow } from '@esta/core/properties';
import { z } from 'zod';
import type { Db } from './db';

/** A row of `property_list_rows`. The lease facts need the Clock's date, which a view does not have, so callers add them. */
export type PropertyRow = Omit<PropertyViewRow, 'leasedUnitCount' | 'monthlyRentVnd'>;

const PROPERTY_ROW_COLUMNS =
  'id, nickname, code, kind, use_mode, legal_status, cover_photo_path, address_line, commune_name, province_code, province_name, certificate_address_text, legacy_province_names, search_text, lat, lng, has_boundary, owner_party_ids, vacant_since, unit_count';

const propertyRowSchema = z
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
    unit_count: z.number().int().min(0).catch(0),
  })
  .transform(
    (row): PropertyRow => ({
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
      vacantSince: row.vacant_since as IsoDate | null,
      unitCount: row.unit_count,
    }),
  );

/** LIKE treats `%`, `_` and `\` as syntax and PostgREST reads `*` as `%`, so a typed one must match only itself. */
const likeToken = (token: string) => `%${token.replace(/[\\%_]/g, '\\$&').replaceAll('*', '')}%`;

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

/**
 * The household's properties whose `search_text` holds every token (`searchTokens` from core), all of them with no
 * token, narrowed by `preferPhrase`. RLS limits the rows to the member's households; the household predicate keeps a
 * member of two to one list.
 */
export async function searchProperties(db: Db, householdId: string, tokens: readonly string[]): Promise<readonly PropertyRow[]> {
  const rows: PropertyRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from('property_list_rows').select(PROPERTY_ROW_COLUMNS).eq('household_id', householdId);
    for (const token of tokens) query = query.ilike('search_text', likeToken(token));
    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading the property list failed: ${error.message}`);
    rows.push(...z.array(propertyRowSchema).parse(data));
    if (data.length < PAGE_SIZE) return preferPhrase(rows, tokens);
  }
}

export type PropertyDetailRow = PropertyRow & { readonly kindDetails: Readonly<Record<string, unknown>> };

const kindDetailsSchema = z.object({ kind_details: z.record(z.string(), z.unknown()) });

/** One property with its kind details; `null` for an archived property or one in another household. */
export async function readPropertyDetail(db: Db, householdId: string, id: string): Promise<PropertyDetailRow | null> {
  const [row, details] = await Promise.all([
    db.from('property_list_rows').select(PROPERTY_ROW_COLUMNS).eq('household_id', householdId).eq('id', id).maybeSingle(),
    db.from('properties').select('kind_details').eq('household_id', householdId).eq('id', id).maybeSingle(),
  ]);
  if (row.error) throw new Error(`Reading the property failed: ${row.error.message}`);
  if (details.error) throw new Error(`Reading the property details failed: ${details.error.message}`);
  if (row.data === null || details.data === null) return null;
  return { ...propertyRowSchema.parse(row.data), kindDetails: kindDetailsSchema.parse(details.data).kind_details };
}

const FORM_COLUMNS =
  'id, nickname, code, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, acquired_on, acquisition_kind, acquisition_price_vnd, notes, cover_photo_path';

/** The columns the property form edits, as stored, for its edit page and for an edit's plan; `null` when archived or out of reach. */
export async function readPropertyForm(db: Db, householdId: string, id: string) {
  const { data, error } = await db.from('properties').select(FORM_COLUMNS).eq('household_id', householdId).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`Reading the property failed: ${error.message}`);
  return data;
}

export type StoredProperty = NonNullable<Awaited<ReturnType<typeof readPropertyForm>>>;
