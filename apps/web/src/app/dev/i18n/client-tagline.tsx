'use client';

import { useTranslations } from 'next-intl';

export function ClientTagline() {
  const t = useTranslations('app');
  return <p data-testid="client-tagline">{t('tagline')}</p>;
}
