'use client';

import { NextIntlClientProvider, type AbstractIntlMessages, type Locale } from 'next-intl';
import type { ReactNode } from 'react';

/** The root layout has no intl provider, so each property island brings one with only the namespaces it reads. */
export function PropertyIntl({ locale, messages, children }: { locale: Locale; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh">
      {children}
    </NextIntlClientProvider>
  );
}
