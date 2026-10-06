import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatDateLong } from '@esta/core/format';
import { getClock } from '@/server/clock';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('tagline') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [clock, locale, messages] = await Promise.all([getClock(), getLocale(), getMessages()]);
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={{ app: messages.app }}>
          <p data-testid="date-line">{formatDateLong(clock.today(), locale)}</p>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
