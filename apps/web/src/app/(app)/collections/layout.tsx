import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

export default async function CollectionsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('collections');
  return <SectionErrorBoundary labels={{ title: t('errorTitle'), body: t('errorBody'), retry: t('retry') }}>{children}</SectionErrorBoundary>;
}
