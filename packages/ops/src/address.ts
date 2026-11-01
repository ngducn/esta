import { z } from 'zod';
import type { Db } from './db';

export type CurrentUnitSuggestion = {
  readonly communeCode: string;
  readonly communeName: string;
  readonly provinceCode: string;
  readonly provinceName: string;
  readonly partial: boolean;
  readonly matchedLegacyName: string;
};

const suggestionSchema = z
  .object({
    commune_code: z.string(),
    commune_name: z.string(),
    province_code: z.string(),
    province_name: z.string(),
    merge_kind: z.enum(['whole', 'partial']),
    matched_legacy_name: z.string(),
  })
  .transform(
    (row): CurrentUnitSuggestion => ({
      communeCode: row.commune_code,
      communeName: row.commune_name,
      provinceCode: row.province_code,
      provinceName: row.province_name,
      partial: row.merge_kind === 'partial',
      matchedLegacyName: row.matched_legacy_name,
    }),
  );

const SUGGESTION_LIMIT = 6;

/** PRP-4: the current units an address typed in the pre-2025 form maps to, best first. */
export async function suggestCurrentUnits(db: Db, text: string): Promise<CurrentUnitSuggestion[]> {
  const { data, error } = await db.rpc('suggest_current_unit', { p_text: text }).limit(SUGGESTION_LIMIT);
  if (error) throw new Error(`Suggesting the current unit failed: ${error.message}`);
  return z.array(suggestionSchema).parse(data);
}

const provinceSchema = z.object({ province_code: z.string() });

/** Every province the current units of an address lie in, uncapped, so a check sees an ambiguity the suggestions cut off. */
export async function currentProvinces(db: Db, text: string): Promise<string[]> {
  const { data, error } = await db.rpc('suggest_current_unit', { p_text: text }).select('province_code');
  if (error) throw new Error(`Reading the provinces of an address failed: ${error.message}`);
  return z.array(provinceSchema).parse(data).map((row) => row.province_code);
}

export async function isCommuneOf(db: Db, communeCode: string, provinceCode: string): Promise<boolean> {
  const { data, error } = await db.from('admin_units').select('code').eq('code', communeCode).eq('parent_code', provinceCode).maybeSingle();
  if (error) throw new Error(`Reading the ward failed: ${error.message}`);
  return data !== null;
}
