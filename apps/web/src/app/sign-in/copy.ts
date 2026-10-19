import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { Around, PasswordCopy } from './auth-fields';

const SLOT = '\u0000';

export function around(format: (slot: string) => string): Around {
  const [before = '', after = ''] = format(SLOT).split(SLOT);
  return [before, after];
}

export async function passwordCopy(): Promise<PasswordCopy> {
  const t = await getTranslations('signIn');
  return { show: t('show'), hide: t('hide'), showLabel: t('showPassword'), hideLabel: t('hidePassword') };
}
