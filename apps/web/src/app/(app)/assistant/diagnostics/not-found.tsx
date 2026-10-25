import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function DiagnosticsNotFound() {
  const t = await getTranslations('assistant.diagnostics');
  return (
    <div data-testid="page-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')} action={{ label: t('back'), href: '/assistant' }} />
    </div>
  );
}
