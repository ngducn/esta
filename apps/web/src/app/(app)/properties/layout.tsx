import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PropertiesErrorBoundary } from '@/components/properties/properties-error-boundary';

export default async function PropertiesLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('properties');
  return <PropertiesErrorBoundary labels={{ title: t('errorTitle'), body: t('errorBody'), retry: t('retry') }}>{children}</PropertiesErrorBoundary>;
}
