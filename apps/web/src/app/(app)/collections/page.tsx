import { boardMonthParam, groupCollections, parseBoardMonth } from '@esta/core/collections';
import { isoDate, type IsoDate } from '@esta/core/date';
import { formatMonthWithin, formatMonthYear } from '@esta/core/format';
import { addMonths, firstOfMonth } from '@esta/core/schedule';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CollectionsBoard } from '@/components/collections/CollectionsBoard';
import { MonthSelector } from '@/components/collections/MonthSelector';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { sectionMetadata } from '@/components/shell/section-page';
import { buttonVariants } from '@/components/ui/button-variants';
import { getClock } from '@/server/clock';
import { loadCollectionRows } from '@/server/collections/load';
import { requireMember } from '@/server/member';

export const generateMetadata = () => sectionMetadata('collections');

/** The picker lists two years before the Clock's year to the end of the next one, plus the month in the address. */
const PICKER_YEARS_BACK = 2;

function pickerMonths(today: IsoDate, month: IsoDate): IsoDate[] {
  const first = addMonths(isoDate(`${today.slice(0, 4)}-01-01`), -12 * PICKER_YEARS_BACK);
  const months = Array.from({ length: 12 * (PICKER_YEARS_BACK + 2) }, (_, index) => addMonths(first, index));
  return months.includes(month) ? months : [...months, month].toSorted();
}

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const [params, member, clock] = await Promise.all([searchParams, requireMember(), getClock()]);
  const today = clock.today();
  const month = parseBoardMonth(typeof params.month === 'string' ? params.month : undefined, today);
  const [rows, nav, t, locale] = await Promise.all([
    loadCollectionRows(member.household.id, month),
    getTranslations('nav'),
    getTranslations('collections'),
    getLocale(),
  ]);
  const monthLabel = formatMonthYear(month, locale);
  const step = (offset: number) => {
    const value = addMonths(month, offset);
    return { href: `/collections?month=${boardMonthParam(value)}`, label: t('monthTitle', { month: formatMonthWithin(value, month, locale) }) };
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h2 break-words lg:text-h1">{nav('collections')}</h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <MonthSelector
          label={t('monthPicker')}
          value={boardMonthParam(month)}
          options={pickerMonths(today, month).map((value) => ({ value: boardMonthParam(value), label: t('monthTitle', { month: formatMonthYear(value, locale) }) }))}
          previous={step(-1)}
          next={step(1)}
        />
        {month === firstOfMonth(today) ? null : (
          <Link href="/collections" data-testid="month-this" className={buttonVariants({ variant: 'quiet' })}>
            {t('thisMonth')}
          </Link>
        )}
      </div>
      <OfflineNotice message={t('offline')} />
      {rows.length === 0 ? (
        <p data-testid="collections-empty" className="max-w-3xl rounded-lg border border-rule bg-surface p-5 text-lead font-semibold text-ink shadow-card sm:p-6">
          {t('empty', { month: monthLabel })}
        </p>
      ) : (
        <CollectionsBoard board={groupCollections(rows, month, today)} month={month} monthLabel={monthLabel} asOf={today} canEdit={member.role !== 'viewer'} />
      )}
    </div>
  );
}
