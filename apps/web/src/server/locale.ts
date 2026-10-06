import 'server-only';
import { cookies } from 'next/headers';
import { isLocale, localeCookie, type Locale } from '@/i18n/locale';
import { createSessionClient } from '@/server/supabase/server';

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * `resolveLocale` prefers the member's locale over the cookie, so a choice made while signed in
 * must reach the member row or the next request reverts it.
 */
export async function chooseLocale(locale: Locale, { signedIn }: { signedIn: boolean }): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(localeCookie, locale, { maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS, sameSite: 'lax', path: '/' });
  if (signedIn) await writeMemberLocale(locale);
}

/** A language picked on the sign-in page carries into the member rows once the user has them. */
export async function carryCookieLocaleToMember(): Promise<void> {
  const cookieLocale = (await cookies()).get(localeCookie)?.value;
  if (isLocale(cookieLocale)) await writeMemberLocale(cookieLocale);
}

async function writeMemberLocale(locale: Locale): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('set_my_locale', { p_locale: locale });
  if (error) throw new Error(`set_my_locale failed: ${error.message}`);
}
