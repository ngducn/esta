import { Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { NewItem } from '@/server/agent/items';

/** The household's unread assistant items under the status line. The inbox (P5-03) grows from this list. */
export async function NewItems({ items, timeOf }: { items: readonly NewItem[]; timeOf: (item: NewItem) => string }) {
  const [t, review] = await Promise.all([getTranslations('assistant'), getTranslations('extraction')]);
  return (
    <section aria-labelledby="new-items-heading" data-testid="new-items" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h2 id="new-items-heading" className="flex items-center gap-3 text-lead font-bold text-ink">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
          <Inbox className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 break-words">{t('newItems')}</span>
      </h2>
      {items.length === 0 ? (
        <p data-testid="no-new-items" className="text-ink-muted">
          {t('noNewItems')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {items.map((item) => (
            <li key={item.id} data-testid="new-item" className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <p className="text-body font-semibold break-words text-ink">{item.title}</p>
              {item.retry === null ? null : <p className="text-body break-words text-ink-2">{t(item.retry === 'self' ? 'retrySelf' : 'retryAsk')}</p>}
              {item.reviewHref === null ? null : (
                <Link href={item.reviewHref} data-testid="item-review" className="w-fit text-body font-semibold text-ink underline underline-offset-4 hover:decoration-2">
                  {item.retry === null ? review('reviewLink') : review('manualLink')}
                </Link>
              )}
              <p className="text-small text-ink-muted figures">{timeOf(item)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
