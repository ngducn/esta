import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const [nav, failed] = await Promise.all([getTranslations('nav'), getTranslations('loadFailed')]);
  return <SectionErrorBoundary labels={{ page: nav('settings'), title: failed('title'), body: failed('body'), retry: failed('retry') }}>{children}</SectionErrorBoundary>;
}
