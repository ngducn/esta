import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function InvoiceNotFound() {
  const t = await getTranslations('invoices');
  return (
    <div data-testid="invoice-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')} action={{ label: t('notFoundAction'), href: '/collections' }} />
    </div>
  );
}
