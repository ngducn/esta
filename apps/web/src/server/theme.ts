import 'server-only';
import { cookies } from 'next/headers';

export const themeCookie = 'esta_theme';

/** Light whatever the system says; dark applies only when the member chose it in Cài đặt. */
export const themePreferences = ['light', 'dark'] as const;

const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ThemePreference = (typeof themePreferences)[number];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return themePreferences.find((theme) => theme === value) ?? 'light';
}

export async function getThemePreference(): Promise<ThemePreference> {
  return parseThemePreference((await cookies()).get(themeCookie)?.value);
}

/** Theme is per device, so it lives in a cookie and not on the member row. */
export async function setThemePreference(theme: ThemePreference): Promise<void> {
  (await cookies()).set(themeCookie, theme, { maxAge: THEME_COOKIE_MAX_AGE_SECONDS, sameSite: 'lax', path: '/' });
}
