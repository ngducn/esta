import { getTranslations } from 'next-intl/server';

// Its own module, so the answer page's re-export does not pull the list page's client components into its bundle.
export async function generateMetadata() {
  const t = await getTranslations('assistant.ask');
  return { title: t('title') };
}
