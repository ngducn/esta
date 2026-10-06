'use server';

import type { Database } from '@esta/db';
import { createClient } from '@supabase/supabase-js';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';
import { z } from 'zod';

const addressText = z.string().max(500);

export type UnitSuggestion = Database['public']['Functions']['suggest_current_unit']['Returns'][number];

// Server actions are reachable even where the dev layout returns 404, so the guard repeats here.
export async function suggestCurrentUnit(text: string): Promise<UnitSuggestion[]> {
  if (!isDevSurfaceEnabled(env)) throw new Error('The dev surface is off');
  const client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('suggest_current_unit', { p_text: addressText.parse(text) });
  if (error) throw new Error(`suggest_current_unit failed: ${error.message}`);
  return data;
}
