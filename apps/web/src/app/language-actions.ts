'use server';

import { revalidatePath } from 'next/cache';
import { isLocale } from '@/i18n/locale';
import { chooseLocale } from '@/server/locale';
import { getSessionUser } from '@/server/member';

export async function switchLanguage(formData: FormData): Promise<void> {
  const locale = formData.get('locale');
  if (typeof locale !== 'string' || !isLocale(locale)) throw new Error('Unknown locale');
  await chooseLocale(locale, { signedIn: (await getSessionUser()) !== null });
  revalidatePath('/', 'layout');
}
