export const locales = ['vi', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'vi';
export const localeCookie = 'NEXT_LOCALE';

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function resolveLocale({
  memberLocale,
  cookieLocale,
}: {
  memberLocale: Locale | null;
  cookieLocale: string | undefined;
}): Locale {
  if (memberLocale) return memberLocale;
  if (isLocale(cookieLocale)) return cookieLocale;
  return defaultLocale;
}
