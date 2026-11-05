import type { CollectionGroup, MonthCollected } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatMonthYear, formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { GROUP_MARKS } from '@/components/collections/CollectionsBoard';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatCard } from '@/components/stat-card';
import { StatusShape } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import type { CollectionRow } from '@esta/ops';

/**
 * This month's collection as the hero stat card: collected against billed, a meter for the share, and the board's four
 * groups with their counts, all read from the same board Thu tiền draws for the month.
 */
export function MonthCollection({ month, board, collected }: { month: IsoDate; board: readonly CollectionGroup<CollectionRow>[]; collected: MonthCollected }) {
  const t = useTranslations('home');
  const tc = useTranslations('collections');
  const locale = useLocale();
  const monthLabel = formatMonthYear(month, locale);
  const { collectedVnd, billedVnd } = collected;
  const percent = billedVnd === 0 ? 0 : Math.floor((collectedVnd * 100) / billedVnd);
  const label = t('monthLabel', { month: monthLabel });
  const known = billedVnd !== 0;
  return (
    <StatCard
      hero
      testId="month-collection"
      labelId="month-title"
      label={label}
      unknownLabel={t('unknownFigure')}
      value={
        known ? (
          <span data-testid="month-figure" data-collected-vnd={collectedVnd} data-billed-vnd={billedVnd}>
            <MoneyDisplay amount={collectedVnd} variant="compact" className="text-start" />
            <span className="ms-2 text-headline font-medium text-text-secondary">
              <span aria-hidden="true">/ </span>
              <span className="sr-only">{t('monthOf')} </span>
              <MoneyDisplay amount={billedVnd} variant="compact" className="text-start" />
            </span>
          </span>
        ) : null
      }
      meter={known ? { label, percent } : null}
      sub={
        known ? (
          <span data-testid="month-rest">{collectedVnd < billedVnd ? t('monthStillOwed', { amount: formatVnd(vnd(billedVnd - collectedVnd), locale) }) : t('monthAllCollected')}</span>
        ) : (
          <span data-testid="month-empty">{t('monthEmpty', { month: monthLabel })}</span>
        )
      }
    >
      {board.every((group) => group.items.length === 0) ? null : (
        <ul aria-label={t('monthGroups')} className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
          {board.map((group) => (
            <li key={group.key} data-testid={`month-group-${group.key}`} data-count={group.items.length} className="flex items-center gap-2 text-body whitespace-nowrap text-text">
              <StatusShape status={GROUP_MARKS[group.key]} />
              <span>{tc('group', { group: group.key })}</span>
              <span className="num font-medium">{group.items.length}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/collections" className={cn(buttonVariants({ variant: 'ghost' }), 'self-start px-0')}>
        {t('openCollections')}
      </Link>
    </StatCard>
  );
}
