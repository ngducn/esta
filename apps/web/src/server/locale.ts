import 'server-only';
import { cookies } from 'next/headers';
import { isLocale, localeCookie, type Locale } from '@/i18n/locale';
import { createSessionClient } from '@/server/supabase/server';

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export async function chooseLocale(locale: Locale, { signedIn }: { signedIn: boolean }): Promise<void> {
  await rememberLocale(locale);
  if (signedIn) await writeMemberLocale(locale);
}

/** Keeps the locale for pages a signed-out visitor sees, such as /sign-in after sign-out. */
export async function rememberLocale(locale: Locale): Promise<void> {
  (await cookies()).set(localeCookie, locale, { maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS, sameSite: 'lax', path: '/' });
}

export async function carryCookieLocaleToMember(): Promise<void> {
  const cookieLocale = (await cookies()).get(localeCookie)?.value;
  if (isLocale(cookieLocale)) await writeMemberLocale(cookieLocale);
}

async function writeMemberLocale(locale: Locale): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('set_my_locale', { p_locale: locale });
  if (error) throw new Error(`set_my_locale failed: ${error.message}`);
}
