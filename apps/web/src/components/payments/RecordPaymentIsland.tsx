'use client';

import type { ComponentProps } from 'react';
import { PropertyIntl } from '@/components/properties/property-intl';
import RecordPaymentSheet from './RecordPaymentSheet';
import type { PaymentIntl } from './RecordPaymentAction';

/**
 * The sheet with its own intl provider, for a screen that mounts none, such as Home: the provider and the next-intl
 * runtime load with this chunk on the first `Ghi nhận`, never with the screen.
 */
export default function RecordPaymentIsland({ intl, ...props }: ComponentProps<typeof RecordPaymentSheet> & { intl: PaymentIntl }) {
  return (
    <PropertyIntl locale={intl.locale} messages={intl.messages}>
      <RecordPaymentSheet {...props} />
    </PropertyIntl>
  );
}
