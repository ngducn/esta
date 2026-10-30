import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function AssistantLinkNotFound() {
  const t = await getTranslations('assistant');
  return (
    <div data-testid="link-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('linkNotFoundTitle')} body={t('linkNotFoundBody')} action={{ label: t('linkNotFoundAction'), href: '/assistant' }} />
    </div>
  );
}
