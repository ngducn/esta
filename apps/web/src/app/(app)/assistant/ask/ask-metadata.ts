import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('assistant.ask');
  return { title: t('title') };
}
