import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10">
      <EmptyState icon={SearchX} title={t('title')} body={t('body')} action={{ label: t('action'), href: '/' }} testId="not-found" />
    </main>
  );
}
