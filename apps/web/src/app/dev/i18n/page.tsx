import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ClientTagline } from './client-tagline';

export const metadata: Metadata = {
  title: 'Client i18n',
};

export default async function DevI18nPage() {
  const messages = await getMessages();
  return (
    <main>
      <h1>Client i18n</h1>
      <NextIntlClientProvider messages={{ app: messages.app }}>
        <ClientTagline />
      </NextIntlClientProvider>
    </main>
  );
}
