import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getCurrentMember } from '@/server/member';
import { getThemePreference } from '@/server/theme';
import { sourceSans3, sourceSerif4 } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('tagline') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, theme, member] = await Promise.all([getLocale(), getThemePreference(), getCurrentMember()]);
  return (
    <html
      lang={locale}
      data-theme={theme}
      data-text-scale={member?.textScale ?? 100}
      data-density={member?.density ?? 'comfortable'}
      className={`${sourceSans3.variable} ${sourceSerif4.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
