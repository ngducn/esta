import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PropertyIntl } from '@/components/properties/property-intl';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { UndoToastProvider } from '@/components/undo-toast';

/**
 * One toast for the vault and its document pages, so `Hoàn tác` after `Sửa thông tin` still works once Mẹ is back on
 * the vault and sees the change.
 */
export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  const [t, locale, messages] = await Promise.all([getTranslations('documents'), getLocale(), getMessages()]);
  const { date, toast } = messages.components;
  return (
    <SectionErrorBoundary labels={{ title: t('errorTitle'), body: t('loadFailed'), retry: t('retry') }}>
      <PropertyIntl locale={locale} messages={{ documents: messages.documents, components: { date, toast } }}>
        <UndoToastProvider>{children}</UndoToastProvider>
      </PropertyIntl>
    </SectionErrorBoundary>
  );
}
