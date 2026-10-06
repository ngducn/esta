import type { Metadata } from 'next';
import { ClientTagline } from './client-tagline';

export const metadata: Metadata = {
  title: 'Client i18n',
};

export default function DevI18nPage() {
  return (
    <main>
      <h1>Client i18n</h1>
      <ClientTagline />
    </main>
  );
}
