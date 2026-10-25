import { getTranslations } from 'next-intl/server';

/** Trợ lý's mark on everything it writes: a ring in the accent with its initial (DESIGN-BRIEF §5.5). */
export async function AssistantMonogram() {
  const t = await getTranslations('assistant');
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-accent text-small font-semibold text-accent">
      {t('monogram')}
    </span>
  );
}
