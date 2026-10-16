import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { preconnect } from 'react-dom';
import { ErrorLabelsProvider } from '@/components/properties/error-labels';
import { env } from '@/server/env';

export default async function PropertiesLayout({ children }: { children: ReactNode }) {
  // The cover photos come from the storage origin, so the connection opens with the shell, before the list data resolves.
  preconnect(new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin);
  const t = await getTranslations('properties');
  return <ErrorLabelsProvider labels={{ title: t('errorTitle'), body: t('errorBody'), retry: t('retry') }}>{children}</ErrorLabelsProvider>;
}
