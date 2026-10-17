import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function PropertyNotFound() {
  const t = await getTranslations('propertyDetail');
  return (
    <div data-testid="property-not-found" className="max-w-3xl">
      <EmptyState icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')} action={{ label: t('notFoundAction'), href: '/properties' }} />
    </div>
  );
}
