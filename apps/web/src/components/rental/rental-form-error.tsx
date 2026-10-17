'use client';

import { useTranslations } from 'next-intl';
import { StatusShape } from '@/components/status-mark';

export type RentalFormErrorKind = 'invalid' | 'duplicate' | 'network' | null;

export function RentalFormError({ error }: { error: RentalFormErrorKind }) {
  const t = useTranslations('propertyRental');
  if (error === null) return null;
  const message = { invalid: t('errorInvalid'), duplicate: t('errorDuplicate'), network: t('errorNetwork') }[error];
  return (
    <p role="alert" data-testid="form-error" className="flex items-start gap-2 text-body text-overdue">
      <StatusShape status="overdue" className="mt-1 size-4" />
      <span className="wrap-anywhere">{message}</span>
    </p>
  );
}
