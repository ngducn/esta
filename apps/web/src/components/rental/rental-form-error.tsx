'use client';

import { useTranslations } from 'next-intl';
import { FormAlert } from '@/components/form-alert';

export type RentalFormErrorKind = 'invalid' | 'duplicate' | 'wholeLeased' | 'network' | null;

export function RentalFormError({ error }: { error: RentalFormErrorKind }) {
  const t = useTranslations('propertyRental');
  if (error === null) return null;
  const message = { invalid: t('errorInvalid'), duplicate: t('errorDuplicate'), wholeLeased: t('errorWholeLeased'), network: t('errorNetwork') }[error];
  return <FormAlert message={message} data-testid="form-error" />;
}
