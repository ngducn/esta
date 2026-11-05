import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';

/** Trợ lý's mark on everything it writes: the ringed `TL` avatar. */
export async function AssistantMonogram() {
  const t = await getTranslations('assistant');
  return <Avatar assistant size="sm" initial={t('monogram')} />;
}
