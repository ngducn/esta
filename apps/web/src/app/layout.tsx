import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatDateLong } from '@esta/core/format';
import { getClock } from '@/server/clock';
import { getThemePreference } from '@/server/theme';
import { sourceSans3, sourceSerif4 } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('tagline') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [clock, locale, theme] = await Promise.all([getClock(), getLocale(), getThemePreference()]);
  return (
    <html lang={locale} data-theme={theme} className={`${sourceSans3.variable} ${sourceSerif4.variable}`}>
      <body>
        <p data-testid="date-line">{formatDateLong(clock.today(), locale)}</p>
        {children}
      </body>
    </html>
  );
}
