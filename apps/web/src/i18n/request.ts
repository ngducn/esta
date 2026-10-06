// tsc rejects the AppConfig augmentation below as an unknown module unless some file imports `next-intl` itself.
import type {} from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { getCurrentMember } from '@/server/member';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { localeCookie, resolveLocale, type Locale } from './locale';

const messages = { vi, en } satisfies Record<Locale, typeof vi>;

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof vi;
  }
}

export default getRequestConfig(async () => {
  const [cookieStore, member] = await Promise.all([cookies(), getCurrentMember()]);
  const locale = resolveLocale({
    memberLocale: member?.locale ?? null,
    cookieLocale: cookieStore.get(localeCookie)?.value,
  });
  return { locale, messages: messages[locale] };
});
