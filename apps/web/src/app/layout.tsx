import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { getCurrentMember } from '@/server/member';
import { getThemePreference } from '@/server/theme';
import { inter } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('tagline') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, theme, member, failed] = await Promise.all([getLocale(), getThemePreference(), getCurrentMember(), getTranslations('loadFailed')]);
  return (
    <html
      lang={locale}
      data-theme={theme}
      data-text-scale={member?.textScale ?? 100}
      data-density={member?.density ?? 'comfortable'}
      className={inter.variable}
    >
      <body>
        <SectionErrorBoundary labels={{ title: failed('title'), body: failed('body'), retry: failed('retry') }}>{children}</SectionErrorBoundary>
      </body>
    </html>
  );
}
