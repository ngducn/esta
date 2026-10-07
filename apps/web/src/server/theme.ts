import 'server-only';
import { cookies } from 'next/headers';

export const themeCookie = 'esta_theme';

const themePreferences = ['light', 'dark', 'system'] as const;

export type ThemePreference = (typeof themePreferences)[number];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return themePreferences.find((theme) => theme === value) ?? 'system';
}

export async function getThemePreference(): Promise<ThemePreference> {
  return parseThemePreference((await cookies()).get(themeCookie)?.value);
}
