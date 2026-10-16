import 'server-only';
import {
  LEGAL_STATUSES,
  PROPERTY_KINDS,
  USE_MODES,
  applyPropertyFilters,
  preferPhrase,
  searchTokens,
  type FilteredProperties,
  type PropertyFilters,
  type PropertyListRow,
} from '@esta/core/properties';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

const COLUMNS =
  'id, nickname, code, kind, use_mode, legal_status, cover_photo_path, address_line, commune_name, province_code, province_name, certificate_address_text, legacy_province_names, search_text';

const rowSchema = z
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
    }),
  );

/** LIKE treats `%`, `_` and `\` as syntax and PostgREST reads `*` as `%`, so a typed one must match only itself. */
const likeToken = (token: string) => `%${token.replace(/[\\%_]/g, '\\$&').replaceAll('*', '')}%`;

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

async function readMatchingRows(supabase: SessionClient, tokens: readonly string[]): Promise<PropertyListRow[]> {
  const rows: PropertyListRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('property_list_rows').select(COLUMNS);
    for (const token of tokens) query = query.ilike('search_text', likeToken(token));
    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading the property list failed: ${error.message}`);
    rows.push(...z.array(rowSchema).parse(data));
    if (data.length < PAGE_SIZE) return rows;
  }
}

export type PropertyList = FilteredProperties & { householdCount: number; provinceNames: ReadonlyMap<string, string> };

export async function listProperties(filters: PropertyFilters): Promise<PropertyList> {
  const supabase = await createSessionClient();
  const tokens = searchTokens(filters.q);
  const [rows, count] = await Promise.all([
    readMatchingRows(supabase, tokens),
    tokens.length === 0 ? null : supabase.from('property_list_rows').select('id', { count: 'exact', head: true }),
  ]);
  if (count?.error) throw new Error(`Counting properties failed: ${count.error.message}`);
  const matches = preferPhrase(rows, tokens);
  return {
    ...applyPropertyFilters(matches, filters),
    householdCount: count?.count ?? rows.length,
    provinceNames: new Map(
      matches.flatMap((row) => (row.provinceCode === null || row.provinceName === null ? [] : [[row.provinceCode, row.provinceName] as const])),
    ),
  };
}
