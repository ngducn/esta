import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ErrorLabelsProvider } from '@/components/properties/error-labels';

export default async function PropertiesLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('properties');
  return <ErrorLabelsProvider labels={{ title: t('errorTitle'), body: t('errorBody'), retry: t('retry') }}>{children}</ErrorLabelsProvider>;
}
