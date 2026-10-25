import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function ConversationNotFound() {
  const t = await getTranslations('assistant.ask');
  return (
    <div data-testid="conversation-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')} action={{ label: t('askAnother'), href: '/assistant/ask' }} />
    </div>
  );
}
