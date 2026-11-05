import { PageHeader } from '@/components/page-header';
import { boardGroups, boardMonthParam, boardTotals, BOARD_FILTERS, groupCollections, longestOverdueDays, monthCollected, parseBoardFilter, parseBoardMonth, type BoardFilter } from '@esta/core/collections';
import { isoDate, type IsoDate } from '@esta/core/date';
import { formatMonthWithin, formatMonthYear, formatVnd } from '@esta/core/format';
import { addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { CircleCheck, FileSpreadsheet, SearchX } from 'lucide-react';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CollectionsBoard } from '@/components/collections/CollectionsBoard';
import { EmptyState } from '@/components/empty-state';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { FilterTabs } from '@/components/filter-tabs';
import { MoneyDisplay } from '@/components/money/money-display';
import { SummaryStrip } from '@/components/summary-strip';
import { MonthSelector } from '@/components/collections/MonthSelector';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { sectionMetadata } from '@/components/shell/section-page';
import { buttonVariants } from '@/components/ui/button-variants';
import { getClock } from '@/server/clock';
import { loadCollectionRows, loadOpenInvoices, loadOwedBills, type PaymentInvoice } from '@/server/collections/load';
import { boardQrs, loadQrLabels, loadReceivingAccount } from '@/server/invoices/qr';
import { requireMember } from '@/server/member';
import { boardReminders, loadReminderLabels } from '@/server/reminders/board';

export const generateMetadata = () => sectionMetadata('collections');

/** The picker lists two years before the Clock's year to the end of the next one, plus the month in the address. */
const PICKER_YEARS_BACK = 2;

function pickerMonths(today: IsoDate, month: IsoDate): IsoDate[] {
  const first = addMonths(isoDate(`${today.slice(0, 4)}-01-01`), -12 * PICKER_YEARS_BACK);
  const months = Array.from({ length: 12 * (PICKER_YEARS_BACK + 2) }, (_, index) => addMonths(first, index));
  return months.includes(month) ? months : [...months, month].toSorted();
}

function boardHref(month: IsoDate | null, status: BoardFilter): string {
  const query = new URLSearchParams();
  if (month !== null) query.set('month', boardMonthParam(month));
  if (status !== 'all') query.set('status', status);
  const search = query.toString();
  return search === '' ? '/collections' : `/collections?${search}`;
}

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[]; status?: string | string[] }> }) {
  const [params, member, clock] = await Promise.all([searchParams, requireMember(), getClock()]);
  const today = clock.today();
  const month = parseBoardMonth(typeof params.month === 'string' ? params.month : undefined, today);
  const status = parseBoardFilter(typeof params.status === 'string' ? params.status : undefined);
  const canEdit = member.role !== 'viewer';
  const [rows, account, openInvoices, nav, t, locale, messages, qrLabels, reminderLabels] = await Promise.all([
    loadCollectionRows(member.household.id, month),
    loadReceivingAccount(member.household.id),
    canEdit ? loadOpenInvoices(member.household.id) : new Map<string, PaymentInvoice[]>(),
    getTranslations('nav'),
    getTranslations('collections'),
    getLocale(),
    getMessages(),
    loadQrLabels(),
    loadReminderLabels(),
  ]);
  const owed = await loadOwedBills(member.household.id, rows);
  const qrs = {
    byInvoice: boardQrs(rows, owed, account, locale),
    labels: qrLabels,
    account: account === null ? null : { id: account.id, bankName: account.bankName, accountNo: account.accountNo },
  };
  // Reminding a tenant is acting for the household, so a viewer gets no `Nhắc qua Zalo`.
  const reminders = { byInvoice: canEdit ? await boardReminders(rows, owed, today, account !== null) : new Map(), labels: reminderLabels };
  const monthLabel = formatMonthYear(month, locale);
  const shortMonth = formatMonthWithin(month, today, locale);
  const onThisMonth = month === firstOfMonth(today);
  const step = (offset: number) => {
    const value = addMonths(month, offset);
    return { href: boardHref(value, status), label: t('monthTitle', { month: formatMonthWithin(value, month, locale) }) };
  };

  const board = groupCollections(rows, month, today);
  const shown = boardGroups(board, status);
  const all = boardTotals(board);
  const collected = monthCollected(board);
  const totals = boardTotals(shown);
  const overdue = boardTotals(boardGroups(board, 'overdue'));
  const paidInFull = boardTotals(boardGroups(board, 'paid')).count;
  const nothingLate = status === 'overdue' || status === 'due';
  const tabs = BOARD_FILTERS.map((filter) => ({
    key: filter,
    label: filter === 'all' ? t('all') : t('group', { group: filter }),
    count: boardTotals(boardGroups(board, filter)).count,
    href: boardHref(onThisMonth ? null : month, filter),
    current: filter === status,
  }));

  const page = (
    <div className="flex flex-col gap-stack">
      <PageHeader
        title={nav('collections')}
        meta={<p>{t('pageMeta', { month: monthLabel, count: rows.length })}</p>}
        actions={
          member.role === 'admin' ? (
            <Link href="/collections/import" data-testid="statement-import-link" className={buttonVariants({ variant: 'secondary' })}>
              <FileSpreadsheet aria-hidden="true" />
              {t('importStatement')}
            </Link>
          ) : undefined
        }
      />
      <OfflineNotice message={t('offline')} />
      <MonthSelector
        label={t('monthPicker')}
        value={boardMonthParam(month)}
        options={pickerMonths(today, month).map((value) => ({ value: boardMonthParam(value), label: t('monthTitle', { month: formatMonthYear(value, locale) }) }))}
        previous={step(-1)}
        next={step(1)}
        thisMonth={onThisMonth ? null : { href: boardHref(null, status), label: t('thisMonth') }}
        query={status === 'all' ? '' : `&status=${status}`}
      >
        {rows.length === 0 ? (
          <div data-testid="collections-empty" className="max-w-3xl">
            <RegistryEmptyState surface="collections" ctx={{ canWrite: canEdit }} values={{ month: monthLabel }} />
          </div>
        ) : (
          <div className="flex flex-col gap-stack">
            <SummaryStrip
              label={t('stripLabel', { month: shortMonth })}
              unknownLabel={t('unknownFigure')}
              figures={[
                {
                  label: t('figurePaid'),
                  value: <MoneyDisplay amount={collected.collectedVnd} className="text-start" />,
                  sub: collected.billedVnd === 0 ? t('figurePaidNone', { month: shortMonth }) : t('figurePaidSub', { billed: formatVnd(collected.billedVnd, locale) }),
                  testId: 'figure-paid',
                },
                {
                  label: t('figureOwed'),
                  value: <MoneyDisplay amount={all.owedVnd} className="text-start" />,
                  sub: t('figureOwedSub', { count: all.count - paidInFull }),
                  testId: 'figure-owed',
                },
                {
                  label: t('figureOverdue'),
                  value: <MoneyDisplay amount={overdue.owedVnd} className="text-start" />,
                  sub: t('figureOverdueSub', { count: overdue.count, days: longestOverdueDays(board) ?? 0 }),
                  testId: 'figure-overdue',
                },
              ]}
            />
            <FilterTabs label={t('statusLabel')} tabs={tabs} />
            {totals.count === 0 ? (
              <div data-testid="collections-filter-empty" className="max-w-3xl">
                <EmptyState
                  icon={nothingLate ? CircleCheck : SearchX}
                  {...(nothingLate ? { tone: 'good' as const } : {})}
                  title={t('emptyFiltered', { status, month: shortMonth })}
                  action={{ label: t('showAll'), href: boardHref(onThisMonth ? null : month, 'all') }}
                />
              </div>
            ) : (
              <CollectionsBoard
                groups={shown}
                totals={totals}
                caption={t('caption', { month: monthLabel, count: totals.count })}
                context={{ month, asOf: today, canEdit, openInvoices, qrs, reminders }}
              />
            )}
          </div>
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
