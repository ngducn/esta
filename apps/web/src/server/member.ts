import 'server-only';
import type { Database } from '@esta/db';
import { cache } from 'react';
import { isLocale, type Locale } from '@/i18n/locale';
import { createSessionClient } from '@/server/supabase/server';

export type Member = {
  id: string;
  role: Database['public']['Enums']['member_role'];
  isOperator: boolean;
  displayName: string | null;
  locale: Locale | null;
  household: { id: string; name: string };
};

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
});

/** The signed-in user's earliest membership. Phase 0 has one household per user. */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const userId = await getSessionUserId();
  if (userId === null) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('household_members')
    .select('id, role, is_operator, display_name, locale, household:households!inner(id, name)')
    .eq('user_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the member failed: ${error.message}`);
  if (data === null) return null;
  return {
    id: data.id,
    role: data.role,
    isOperator: data.is_operator,
    displayName: data.display_name,
    locale: isLocale(data.locale) ? data.locale : null,
    household: data.household,
  };
});
