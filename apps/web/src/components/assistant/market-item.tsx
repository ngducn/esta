import { formatDate, type Locale } from '@esta/core/format';
import { getTranslations } from 'next-intl/server';
import type { MarketItem as Item } from '@/server/agent/research';
import { CitationChip } from './citation-chip';

/** One research item as Mẹ reads it: what happened, why it matters to the family, and the source it came from. */
export async function MarketItem({ item, locale }: { item: Item; locale: Locale }) {
  const t = await getTranslations('assistant.market');
  const published = formatDate(item.publishedOn, locale);
  return (
    <article data-testid="market-item" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h3 className="text-lead font-semibold break-words text-ink">{item.title}</h3>
      <p className="max-w-prose text-body text-pretty break-words text-ink-2">{item.summary}</p>
      <p data-testid="market-why" className="max-w-prose text-body text-pretty break-words text-ink-2">
        <span className="font-medium text-ink">{t('why')}</span> {item.why}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-3">
        <CitationChip href={item.sourceUrl} index={1} label={t('sourceLabel', { index: 1, name: item.sourceName, date: published })}>
          {t('source', { name: item.sourceName, date: published })}
        </CitationChip>
        <span className="text-small text-ink-muted">{t(`kind.${item.kind}`)}</span>
        {item.effectiveOn === null ? null : <span className="text-small text-ink-muted figures">{t('effectiveOn', { date: formatDate(item.effectiveOn, locale) })}</span>}
      </div>
    </article>
  );
}
