import 'server-only';
import { cookies } from 'next/headers';

export const themeCookie = 'esta_theme';

export const themePreferences = ['light', 'dark', 'system'] as const;

const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ThemePreference = (typeof themePreferences)[number];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return themePreferences.find((theme) => theme === value) ?? 'system';
}

export async function getThemePreference(): Promise<ThemePreference> {
  return parseThemePreference((await cookies()).get(themeCookie)?.value);
}

/** Theme is per device, so it lives in a cookie and not on the member row. */
export async function setThemePreference(theme: ThemePreference): Promise<void> {
  (await cookies()).set(themeCookie, theme, { maxAge: THEME_COOKIE_MAX_AGE_SECONDS, sameSite: 'lax', path: '/' });
}
