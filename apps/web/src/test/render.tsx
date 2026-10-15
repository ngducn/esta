import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

const messages = { vi, en };

export function renderInLocale(ui: ReactElement, locale: 'vi' | 'en' = 'vi') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Ho_Chi_Minh">
      {ui}
    </NextIntlClientProvider>,
  );
}
