import 'server-only';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type AdminUnitOption = { readonly code: string; readonly name: string };

export type CurrentUnitSuggestion = {
  readonly communeCode: string;
  readonly communeName: string;
  readonly provinceCode: string;
  readonly provinceName: string;
  readonly partial: boolean;
  readonly matchedLegacyName: string;
};

const unitSchema = z.object({ code: z.string(), name: z.string() });

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

/** The 34 province-level units, by name. */
export async function listProvinces(): Promise<AdminUnitOption[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('admin_units').select('code, name').is('parent_code', null).order('name');
  if (error) throw new Error(`Reading provinces failed: ${error.message}`);
  return z.array(unitSchema).parse(data);
}

export async function listCommunes(provinceCode: string): Promise<AdminUnitOption[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('admin_units').select('code, name').eq('parent_code', provinceCode).order('name');
  if (error) throw new Error(`Reading wards and communes failed: ${error.message}`);
  return z.array(unitSchema).parse(data);
}

export async function isCommuneOf(communeCode: string, provinceCode: string): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('admin_units').select('code').eq('code', communeCode).eq('parent_code', provinceCode).maybeSingle();
  if (error) throw new Error(`Reading the ward failed: ${error.message}`);
  return data !== null;
}

/** PRP-4: the current units an address typed in the pre-2025 form maps to, best first. */
export async function suggestCurrentUnits(text: string): Promise<CurrentUnitSuggestion[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('suggest_current_unit', { p_text: text }).limit(SUGGESTION_LIMIT);
  if (error) throw new Error(`Suggesting the current unit failed: ${error.message}`);
  return z.array(suggestionSchema).parse(data);
}
