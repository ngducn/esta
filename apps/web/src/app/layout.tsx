import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatDateLong } from '@esta/core/format';
import { getClock } from '@/server/clock';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('tagline') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [clock, locale] = await Promise.all([getClock(), getLocale()]);
  return (
    <html lang={locale}>
      <body>
        <p data-testid="date-line">{formatDateLong(clock.today(), 'vi')}</p>
        {children}
      </body>
    </html>
  );
}
