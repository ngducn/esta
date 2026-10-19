import 'server-only';
import type { Database } from '@esta/db';
import { readMembership } from '@esta/ops';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isDensity, textScales, type Density, type TextScale } from '@/design/tokens';
import { isLocale, type Locale } from '@/i18n/locale';
import { createSessionClient } from '@/server/supabase/server';

export type Member = {
  id: string;
  role: Database['public']['Enums']['member_role'];
  isOperator: boolean;
  displayName: string | null;
  locale: Locale | null;
  textScale: TextScale;
  density: Density;
  household: { id: string; name: string };
};

export type SessionUser = { id: string; email: string | null };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  return data === null ? null : { id: data.claims.sub, email: data.claims.email ?? null };
});

export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const user = await getSessionUser();
  if (user === null) return null;
  const data = await readMembership(await createSessionClient(), user.id);
  if (data === null) return null;
  return {
    id: data.id,
    role: data.role,
    isOperator: data.is_operator,
    displayName: data.display_name,
    locale: isLocale(data.locale) ? data.locale : null,
    textScale: textScales.find((scale) => scale === data.text_scale) ?? 100,
    density: isDensity(data.density) ? data.density : 'comfortable',
    household: { id: data.household.id, name: data.household.name },
  };
});

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember();
  if (member === null) redirect('/onboarding');
  return member;
}
