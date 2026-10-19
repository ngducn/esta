import { boardMonthParam, groupCollections, parseBoardMonth } from '@esta/core/collections';
import { isoDate, type IsoDate } from '@esta/core/date';
import { formatMonthWithin, formatMonthYear } from '@esta/core/format';
import { addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { CollectionsBoard } from '@/components/collections/CollectionsBoard';
import { MonthSelector } from '@/components/collections/MonthSelector';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { sectionMetadata } from '@/components/shell/section-page';
import { getClock } from '@/server/clock';
import { loadCollectionRows, loadOpenInvoices, type PaymentInvoice } from '@/server/collections/load';
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
  const canEdit = member.role !== 'viewer';
  const [rows, openInvoices, nav, t, locale, messages] = await Promise.all([
    loadCollectionRows(member.household.id, month),
    canEdit ? loadOpenInvoices(member.household.id) : new Map<string, PaymentInvoice[]>(),
    getTranslations('nav'),
    getTranslations('collections'),
    getLocale(),
    getMessages(),
  ]);
  const monthLabel = formatMonthYear(month, locale);
  const step = (offset: number) => {
    const value = addMonths(month, offset);
    return { href: `/collections?month=${boardMonthParam(value)}`, label: t('monthTitle', { month: formatMonthWithin(value, month, locale) }) };
  };

  const page = (
    <div className="flex flex-col gap-5">
      <h1 className="text-h2 break-words lg:text-h1">{nav('collections')}</h1>
      <OfflineNotice message={t('offline')} />
      <MonthSelector
        label={t('monthPicker')}
        value={boardMonthParam(month)}
        options={pickerMonths(today, month).map((value) => ({ value: boardMonthParam(value), label: t('monthTitle', { month: formatMonthYear(value, locale) }) }))}
        previous={step(-1)}
        next={step(1)}
        thisMonth={month === firstOfMonth(today) ? null : { href: '/collections', label: t('thisMonth') }}
      >
        {rows.length === 0 ? (
          <p data-testid="collections-empty" className="max-w-3xl rounded-lg border border-rule bg-surface p-5 text-lead font-semibold text-ink shadow-card sm:p-6">
            {t('empty', { month: monthLabel })}
          </p>
        ) : (
          <CollectionsBoard board={groupCollections(rows, month, today)} month={month} monthLabel={monthLabel} asOf={today} canEdit={canEdit} openInvoices={openInvoices} />
        )}
      </MonthSelector>
    </div>
  );
  if (!canEdit) return page;
  // Only a member who can record a payment loads the sheet's messages and the toast with Hoàn tác.
  const { payments, components } = messages;
  return (
    <PropertyIntl locale={locale} messages={{ payments, components: { money: components.money, date: components.date, toast: components.toast } }}>
      <UndoToastProvider>{page}</UndoToastProvider>
    </PropertyIntl>
  );
}
