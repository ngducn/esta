import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UndoToastProvider } from '@/components/undo-toast';

/**
 * One toast for the vault and its document pages, so `Hoàn tác` after `Sửa thông tin` still works once Mẹ is back on
 * the vault and sees the change. The review screen sits outside this group and keeps the app's own states.
 */
export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const { date, toast } = messages.components;
  return (
    <PropertyIntl locale={locale} messages={{ documents: messages.documents, components: { date, toast } }}>
      <UndoToastProvider>{children}</UndoToastProvider>
    </PropertyIntl>
  );
}
