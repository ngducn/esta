import 'server-only';
import { suggestCurrentUnits as suggestUnits, type CurrentUnitSuggestion } from '@esta/ops';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type AdminUnitOption = { readonly code: string; readonly name: string };

const unitSchema = z.object({ code: z.string(), name: z.string() });

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
  return suggestUnits(await createSessionClient(), text);
}
