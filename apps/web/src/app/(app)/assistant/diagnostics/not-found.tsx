import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

/** What anyone but an operator sees at the diagnostics link: a plain missing page that says nothing of what it holds. */
export default async function DiagnosticsNotFound() {
  const t = await getTranslations('assistant.diagnostics');
  return (
    <div data-testid="page-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')} action={{ label: t('back'), href: '/assistant' }} />
    </div>
  );
}
