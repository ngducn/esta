'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isDensity, textScales, type Density } from '@/design/tokens';
import { locales } from '@/i18n/locale';
import { rememberLocale } from '@/server/locale';
import { createSessionClient } from '@/server/supabase/server';
import { setThemePreference, themePreferences } from '@/server/theme';

const displaySettings = z.object({
  locale: z.enum(locales),
  textScale: z.coerce.number().pipe(z.literal(textScales)),
  density: z.custom<Density>(isDensity),
  theme: z.enum(themePreferences),
});

export async function saveDisplaySettings(formData: FormData): Promise<void> {
  const parsed = displaySettings.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/settings?status=failed');
  const { locale, textScale, density, theme } = parsed.data;

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('update_my_display_settings', {
    p_locale: locale,
    p_text_scale: textScale,
    p_density: density,
  });
  if (error) redirect('/settings?status=failed');

  await Promise.all([rememberLocale(locale), setThemePreference(theme)]);
  revalidatePath('/', 'layout');
  redirect('/settings?status=saved');
}
