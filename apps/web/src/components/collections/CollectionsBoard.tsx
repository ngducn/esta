import type { CollectionGroup, CollectionGroupKey, CollectionItem } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatMonthWithin, formatRelativeDue, type Locale } from '@esta/core/format';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { QrAction } from '@/components/invoices/QrAction';
import type { QrSheetLabels } from '@/components/invoices/QrSheet';
import { MoneyDisplay } from '@/components/money/money-display';
import { RecordPaymentAction } from '@/components/payments/RecordPaymentAction';
import type { PaymentAccount } from '@/components/payments/RecordPaymentSheet';
import { StatusMark, StatusShape, type MarkStatus } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CollectionRow, PaymentInvoice } from '@/server/collections/load';
import type { InvoiceQrView } from '@/server/invoices/qr';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';
import { ReminderAction } from './ReminderAction';
import { collectionRowActions } from './rowActions';

export const GROUP_MARKS = { overdue: 'overdue', due: 'due', notDue: 'upcoming', paid: 'paid' } as const satisfies Record<CollectionGroupKey, MarkStatus>;

type Board = readonly CollectionGroup<CollectionRow>[];
/** Each lease's open invoices, which `Ghi nhận` prefills from and settles. */
type OpenInvoices = ReadonlyMap<string, readonly PaymentInvoice[]>;
/** Each owed row's `Mã QR`, by invoice; a row is missing when the household has no default receiving account. */
/** Each owed row's code, and the default receiving account a transfer recorded from the board lands in. */
export type BoardQrs = { readonly byInvoice: ReadonlyMap<string, InvoiceQrView>; readonly labels: QrSheetLabels; readonly account: PaymentAccount | null };
/** Each owed row's `Nhắc qua Zalo`, by invoice. */
export type BoardReminders = { readonly byInvoice: ReadonlyMap<string, ReminderTarget>; readonly labels: ReminderLabels };

/** Below 640 px every row stacks: place and amount, tenant and due date, the status, then the actions. */
const cell = {
  place: 'max-sm:col-start-1 max-sm:row-start-1',
  amount: 'max-sm:col-start-2 max-sm:row-start-1 max-sm:self-start',
  tenant: 'max-sm:col-start-1 max-sm:row-start-2',
  due: 'max-sm:col-start-2 max-sm:row-start-2 max-sm:text-end',
  status: 'max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-3',
  actions: 'max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-4 max-sm:pt-1',
} as const;

function StatusCell({ item, month, asOf, locale }: { item: CollectionItem<CollectionRow>; month: IsoDate; asOf: IsoDate; locale: Locale }) {
  const t = useTranslations('collections');
  const { state, carriedFrom } = item;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {state.group === 'overdue' ? <StatusMark status="overdue" days={state.days} /> : <StatusMark status={GROUP_MARKS[state.group]} />}
      {carriedFrom === null ? null : (
        <span data-testid="carried-from" className="text-small font-medium text-ink-2">
          {t('carriedFrom', { month: formatMonthWithin(carriedFrom, month, locale) })}
        </span>
      )}
      {state.group === 'notDue' ? <span className="text-small text-ink-muted">{formatRelativeDue(item.row.dueDate, asOf, locale)}</span> : null}
      {item.row.paymentStatus === 'partial' ? (
        <span data-testid="row-partial" className="text-small font-medium text-ink-2">
          {t('partial')}
        </span>
      ) : null}
    </span>
  );
}

function CollectionsRow({
  item,
  month,
  asOf,
  canEdit,
  openInvoices,
  qrs,
  reminders,
}: {
  item: CollectionItem<CollectionRow>;
  month: IsoDate;
  asOf: IsoDate;
  canEdit: boolean;
  openInvoices: OpenInvoices;
  qrs: BoardQrs;
  reminders: BoardReminders;
}) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { row } = item;
  const qr = qrs.byInvoice.get(row.invoiceId);
  const reminder = reminders.byInvoice.get(row.invoiceId);
  const place = row.wholeUnit ? row.propertyName : t('place', { unit: row.unitLabel, property: row.propertyName });
  return (
    <TableRow
      data-testid="collections-row"
      data-group={item.state.group}
      className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:border-b max-sm:border-rule max-sm:px-4 max-sm:py-3.5 max-sm:last:border-b-0"
    >
      <TableCell className={cn('lg:min-w-60 max-sm:border-0 max-sm:p-0', cell.place)}>
        <span data-testid="row-place" className="block min-w-0 text-body font-medium break-words text-ink">
          {place}
        </span>
        {row.propertyArchived ? (
          <span data-testid="row-archived" className="text-small font-medium text-ink-2">
            {t('propertyArchived')}
          </span>
        ) : null}
      </TableCell>
      <TableCell className={cn('text-body text-ink-2 max-sm:border-0 max-sm:p-0', cell.tenant)}>
        <span data-testid="row-tenant" className="break-words">
          {row.tenantName ?? t('noTenant')}
        </span>
      </TableCell>
      <TableCell className={cn('text-body whitespace-nowrap text-ink-2 max-sm:border-0 max-sm:p-0', cell.due)}>
        <span data-testid="row-due" className="figures">
          <span className="sm:sr-only">{t('dueOn', { date: formatDate(row.dueDate, locale) })}</span>
          <span aria-hidden="true" className="max-sm:hidden">
            {formatDate(row.dueDate, locale)}
          </span>
        </span>
      </TableCell>
      <TableCell className={cn('max-sm:border-0 max-sm:p-0', cell.status)}>
        <StatusCell item={item} month={month} asOf={asOf} locale={locale} />
      </TableCell>
      <TableCell className={cn('text-end max-sm:border-0 max-sm:p-0', cell.amount)}>
        <MoneyDisplay amount={item.amountVnd} className="text-body font-medium text-ink" />
      </TableCell>
      {/* Wide enough for Nhắc qua Zalo and Xem hợp đồng on one line, so a row's actions take two lines, not three. */}
      <TableCell className={cn('text-end lg:min-w-[19.5rem] max-sm:border-0 max-sm:p-0 max-sm:text-start', cell.actions)}>
        <span className="inline-flex flex-wrap gap-2">
          {collectionRowActions(item, canEdit).map((action) => {
            switch (action.kind) {
              case 'link':
                return (
                  <Link key={action.id} href={action.href(row)} data-testid={`row-action-${action.id}`} className={buttonVariants({ variant: 'quiet', className: 'max-sm:first:-ml-2' })}>
                    {t(action.label)}
                  </Link>
                );
              case 'qr':
                return qr === undefined ? null : (
                  <QrAction
                    key={action.id}
                    label={t(action.label)}
                    title={place}
                    description={t('qrDescription', { number: row.number, date: formatDate(row.dueDate, locale) })}
                    invoiceHref={`/collections/invoices/${row.invoiceId}`}
                    qr={qr}
                    labels={qrs.labels}
                  />
                );
              case 'remind':
                return reminder === undefined ? null : <ReminderAction key={action.id} label={t(action.label)} title={place} target={reminder} labels={reminders.labels} />;
              case 'recordPayment':
                return (
                  <RecordPaymentAction
                    key={action.id}
                    label={t(action.label)}
                    target={{
                      invoiceId: row.invoiceId,
                      place,
                      shortPlace: row.wholeUnit ? row.propertyName : row.unitLabel,
                      tenantName: row.tenantName,
                      openInvoices: openInvoices.get(row.leaseId) ?? [],
                      today: asOf,
                      account: qrs.account,
                    }}
                  />
                );
            }
          })}
        </span>
      </TableCell>
    </TableRow>
  );
}

function GroupHeader({ group }: { group: CollectionGroup<CollectionRow> }) {
  const t = useTranslations('collections');
  const id = `collections-${group.key}`;
  return (
    <TableRow className="max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:border-b max-sm:border-rule max-sm:bg-surface-2 max-sm:px-4 max-sm:py-3">
      <TableHead id={id} scope="rowgroup" colSpan={4} className="bg-surface-2 py-3 max-sm:border-0 max-sm:p-0">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-normal">
          <StatusShape status={GROUP_MARKS[group.key]} />
          <span data-testid="group-title" className="text-lead font-semibold text-ink">
            {t('group', { group: group.key })}
          </span>
          <span data-testid="group-count" className="text-body font-medium text-ink-muted">
            {t('groupCount', { count: group.items.length })}
          </span>
        </span>
      </TableHead>
      <TableCell className="bg-surface-2 py-3 text-end max-sm:border-0 max-sm:p-0">
        {group.items.length === 0 ? null : <MoneyDisplay amount={group.totalVnd} className="text-lead font-medium text-ink" />}
      </TableCell>
      <TableCell aria-hidden="true" className="bg-surface-2 py-3 max-sm:hidden" />
    </TableRow>
  );
}

/** LSE-10: four groups in the order Mẹ reads them, each with its count and total, in one table whose header stays put. */
export function CollectionsBoard({
  board,
  month,
  monthLabel,
  asOf,
  canEdit,
  openInvoices,
  qrs,
  reminders,
}: {
  board: Board;
  month: IsoDate;
  monthLabel: string;
  asOf: IsoDate;
  canEdit: boolean;
  openInvoices: OpenInvoices;
  qrs: BoardQrs;
  reminders: BoardReminders;
}) {
  const t = useTranslations('collections');
  return (
    <div data-testid="collections-board" className="rounded-lg border border-rule bg-surface shadow-card">
      <Table className="max-sm:block">
        <caption className="sr-only">{t('caption', { month: monthLabel })}</caption>
        <TableHeader className="max-sm:sr-only">
          <TableRow>
            {(['colPlace', 'colTenant', 'colDue', 'colStatus', 'colAmount', 'colActions'] as const).map((key, index) => (
              <TableHead
                key={key}
                scope="col"
                className={cn('sticky top-0 z-10 bg-surface-2', index === 0 && 'rounded-tl-lg', index === 5 && 'rounded-tr-lg', (key === 'colAmount' || key === 'colActions') && 'text-end')}
              >
                {key === 'colActions' ? <span className="sr-only">{t(key)}</span> : t(key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {board.map((group) => (
          <TableBody key={group.key} data-testid={`group-${group.key}`} aria-labelledby={`collections-${group.key}`} className="max-sm:block">
            <GroupHeader group={group} />
            {group.items.length === 0 ? (
              <TableRow className="max-sm:block">
                <TableCell colSpan={6} className="text-body text-ink-muted max-sm:block max-sm:border-b max-sm:border-rule max-sm:px-4">
                  {t('groupEmpty', { group: group.key })}
                </TableCell>
              </TableRow>
            ) : (
              group.items.map((item) => <CollectionsRow key={item.row.invoiceId} item={item} month={month} asOf={asOf} canEdit={canEdit} openInvoices={openInvoices} qrs={qrs} reminders={reminders} />)
            )}
          </TableBody>
        ))}
      </Table>
    </div>
  );
}
