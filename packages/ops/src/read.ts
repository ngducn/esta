import { formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { currentAddressText } from '@esta/core/properties';
import { foldVietnamese, matchesSearch } from '@esta/core/search';
import type { Json } from '@esta/db';
import type { Db } from './db';

export type ReadContext = { readonly db: Db; readonly householdId: string; readonly locale: Locale };

const money = (amount: number | null, locale: Locale) => (amount === null ? null : formatVnd(vnd(amount), locale));

const LIST_COLUMNS =
  'id, nickname, code, kind, use_mode, legal_status, address_line, commune_name, province_name, certificate_address_text, unit_count, search_text';

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

async function listRows(ctx: ReadContext) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await ctx.db
      .from('property_list_rows')
      .select(LIST_COLUMNS)
      .eq('household_id', ctx.householdId)
      .order('nickname')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading the properties failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

type ListRow = Awaited<ReturnType<typeof listRows>>[number];

const addressOf = (row: Pick<ListRow, 'address_line' | 'commune_name' | 'province_name'>) => currentAddressText({ addressLine: row.address_line, communeName: row.commune_name, provinceName: row.province_name });

export async function listProperties(ctx: ReadContext) {
  return (await listRows(ctx)).map((row) => ({
    id: row.id,
    nickname: row.nickname,
    code: row.code,
    kind: row.kind,
    use_mode: row.use_mode,
    legal_status: row.legal_status,
    address: addressOf(row),
    certificate_address: row.certificate_address_text,
    unit_count: row.unit_count,
  }));
}

/** The property as the form shows it, with its units, every amount beside its display string. Null when the session cannot see it. */
export async function getProperty(ctx: ReadContext, id: string) {
  const { data, error } = await ctx.db
    .from('properties')
    .select(
      'id, nickname, code, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, acquired_on, acquisition_kind, acquisition_price_vnd, notes, deleted_at, units(id, label, kind, list_rent_vnd, area_m2, sort_order)',
    )
    .eq('household_id', ctx.householdId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Reading the property failed: ${error.message}`);
  if (data === null) return null;
  const { units, deleted_at: deletedAt, ...property } = data;
  const fee = managementFee(property.kind_details);
  return {
    ...property,
    archived: deletedAt !== null,
    acquisition_price_display: money(property.acquisition_price_vnd, ctx.locale),
    management_fee_display: money(fee, ctx.locale),
    units: units
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((unit) => ({ id: unit.id, label: unit.label, kind: unit.kind, area_m2: unit.area_m2, list_rent_vnd: unit.list_rent_vnd, list_rent_display: money(unit.list_rent_vnd, ctx.locale) })),
  };
}

function managementFee(details: Json): number | null {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return null;
  const fee = details.management_fee_vnd;
  return typeof fee === 'number' ? fee : null;
}

const MAX_CANDIDATES = 10;

export type FindRow = Pick<ListRow, 'id' | 'nickname' | 'code' | 'address_line' | 'commune_name' | 'province_name' | 'certificate_address_text' | 'search_text'>;

const FIELDS: readonly (readonly [string, (row: FindRow) => string | null])[] = [
  ['nickname', (row) => row.nickname],
  ['code', (row) => row.code],
  ['current address', addressOf],
  ['certificate address', (row) => row.certificate_address_text],
];
const LEGACY_NAMES = 'old ward, district or province name';

function reasonsFor(row: FindRow, words: readonly string[]): string[] {
  const field = (word: string) => FIELDS.find(([, read]) => foldVietnamese(read(row) ?? '').includes(word))?.[0] ?? LEGACY_NAMES;
  return [...new Set(words.map(field))];
}

const rank = (reasons: readonly string[], exactCode: boolean) => (exactCode ? 2 : reasons.includes('nickname') ? 1 : 0);

/**
 * Properties whose words all appear in the nickname, the code, the current address, the certificate address or the
 * pre-2025 names of their ward, district and province (the list view's `search_text` carries those), each with what
 * matched. An exact code ranks first, then a nickname match.
 */
export function rankCandidates(rows: readonly FindRow[], text: string) {
  const words = foldVietnamese(text).split(/\s+/).filter((word) => word !== '');
  const code = text.trim().toUpperCase();
  return rows
    .flatMap((row) => {
      const exactCode = row.code === code;
      if (!exactCode && (row.search_text === null || !matchesSearch(text, row.search_text))) return [];
      const reasons = exactCode ? ['code'] : reasonsFor(row, words);
      return [{ candidate: { id: row.id, nickname: row.nickname, code: row.code, address: addressOf(row), reasons }, rank: rank(reasons, exactCode) }];
    })
    .toSorted((a, b) => b.rank - a.rank)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }) => candidate);
}

export async function findProperty(ctx: ReadContext, text: string) {
  return rankCandidates(await listRows(ctx), text);
}
