import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UndoToastProvider } from '@/components/undo-toast';

/** Outlives its pages, so a toast raised as a lease form hands over to the activated lease stays on screen. */
export default async function RentalLayout({ children }: { children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <PropertyIntl locale={locale} messages={{ components: { toast: messages.components.toast } }}>
      <UndoToastProvider>{children}</UndoToastProvider>
    </PropertyIntl>
  );
}
