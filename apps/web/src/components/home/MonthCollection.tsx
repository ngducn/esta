import type { CollectionGroup, MonthCollected } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatMonthYear, formatVnd, formatVndCompact } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { GROUP_MARKS } from '@/components/collections/CollectionsBoard';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import type { CollectionRow } from '@/server/collections/load';

/**
 * This month's collection: `Đã thu X / Y` in the compact form a summary uses, a thin rule for the share collected, and
 * the board's four groups with their counts, read from the same board Thu tiền draws for the month.
 */
export function MonthCollection({ month, board, collected }: { month: IsoDate; board: readonly CollectionGroup<CollectionRow>[]; collected: MonthCollected }) {
  const t = useTranslations('home');
  const tc = useTranslations('collections');
  const locale = useLocale();
  const monthLabel = formatMonthYear(month, locale);
  const { collectedVnd, billedVnd } = collected;
  const percent = billedVnd === 0 ? 0 : Math.floor((collectedVnd * 100) / billedVnd);
  return (
    <section aria-labelledby="month-title" data-testid="month-collection" className="flex flex-col gap-5 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="month-title" className="text-h3 text-ink">
          {tc('monthTitle', { month: monthLabel })}
        </h2>
        <Link href="/collections" className={buttonVariants({ variant: 'quiet', className: 'px-0' })}>
          {t('openCollections')}
        </Link>
      </div>
      {billedVnd === 0 ? (
        <p data-testid="month-empty" className="text-body text-ink-2">
          {t('monthEmpty', { month: monthLabel })}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p data-testid="month-figure" data-collected-vnd={collectedVnd} data-billed-vnd={billedVnd} className="flex flex-wrap items-baseline gap-x-2.5 text-ink">
            {t.rich('monthFigure', {
              collected: formatVndCompact(collectedVnd, locale),
              billed: formatVndCompact(billedVnd, locale),
              label: (chunks) => <span className="text-lead font-semibold text-ink-2">{chunks}</span>,
              amounts: (chunks) => <span className="flex flex-wrap items-baseline gap-x-2.5">{chunks}</span>,
              big: (chunks) => <span className="figures text-hero font-bold tracking-tight whitespace-nowrap">{chunks}</span>,
              small: (chunks) => <span className="figures text-h2 font-bold whitespace-nowrap text-ink-muted">{chunks}</span>,
              slash: (chunks) => <span aria-hidden="true">{chunks}</span>,
              of: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
          </p>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full bg-paid" style={{ width: `${percent}%` }} />
          </div>
          <p data-testid="month-rest" className="text-body text-ink-2">
            {collectedVnd < billedVnd ? t('monthStillOwed', { amount: formatVnd(vnd(billedVnd - collectedVnd), locale) }) : t('monthAllCollected')}
          </p>
        </div>
      )}
      <ul aria-label={t('monthGroups')} className="grid grid-cols-2 gap-2">
        {board.map((group) => (
          <li key={group.key} data-testid={`month-group-${group.key}`} data-count={group.items.length} className="flex min-h-touch items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
            <StatusShape status={GROUP_MARKS[group.key]} />
            <span className="min-w-0 flex-1 text-body break-words text-ink">{tc('group', { group: group.key })}</span>
            <span className="figures text-lead font-bold text-ink">{group.items.length}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
