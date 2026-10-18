import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

/** The vault list's own error state; a document page keeps the app's. */
export default async function VaultListLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('documents');
  return <SectionErrorBoundary labels={{ title: t('errorTitle'), body: t('loadFailed'), retry: t('retry') }}>{children}</SectionErrorBoundary>;
}
