import type { BoardTotals, CollectionGroup, CollectionGroupKey, CollectionItem } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatMonthWithin, formatRelativeDue } from '@esta/core/format';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { QrAction } from '@/components/invoices/QrAction';
import type { QrSheetLabels } from '@/components/invoices/QrSheet';
import { MoneyDisplay } from '@/components/money/money-display';
import { RecordPaymentAction } from '@/components/payments/RecordPaymentAction';
import type { PaymentAccount } from '@/components/payments/RecordPaymentSheet';
import type { MarkStatus } from '@/components/status-shape';
import { StatusMark } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CollectionRow } from '@esta/ops';
import type { PaymentInvoice } from '@/server/collections/load';
import type { InvoiceQrView } from '@/server/invoices/qr';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';
import { ReminderAction } from './ReminderAction';
import { collectionRowActions } from './rowActions';

export const GROUP_MARKS = { overdue: 'overdue', due: 'due', notDue: 'upcoming', paid: 'paid' } as const satisfies Record<CollectionGroupKey, MarkStatus>;

/** Each owed row's code, and the default receiving account a transfer recorded from the board lands in. */
export type BoardQrs = { readonly byInvoice: ReadonlyMap<string, InvoiceQrView>; readonly labels: QrSheetLabels; readonly account: PaymentAccount | null };
/** Each owed row's `Nhắc qua Zalo`, by invoice. */
export type BoardReminders = { readonly byInvoice: ReadonlyMap<string, ReminderTarget>; readonly labels: ReminderLabels };

export type BoardRowContext = {
  readonly month: IsoDate;
  readonly asOf: IsoDate;
  readonly canEdit: boolean;
  /** Each lease's open invoices, which `Ghi nhận` prefills from and settles. */
  readonly openInvoices: ReadonlyMap<string, readonly PaymentInvoice[]>;
  readonly qrs: BoardQrs;
  readonly reminders: BoardReminders;
};

const list ='@max-[56rem]:h-auto @max-[56rem]:min-h-0 @max-[56rem]:border-0 @max-[56rem]:p-0';
const cell = {
  place: 'w-full max-w-0 @max-[56rem]:w-auto @max-[56rem]:max-w-none @max-[56rem]:col-start-1 @max-[56rem]:row-start-1',
  owed: 'text-end whitespace-nowrap @max-[56rem]:col-start-2 @max-[56rem]:row-start-1 @max-[56rem]:self-start',
  due: 'whitespace-nowrap text-text-secondary @max-[56rem]:col-span-2 @max-[56rem]:text-body-sm @max-[56rem]:whitespace-normal',
  paid: 'text-end whitespace-nowrap @max-[56rem]:col-span-2 @max-[56rem]:text-start @max-[56rem]:text-body-sm @max-[56rem]:text-text-secondary',
  status: 'whitespace-nowrap @max-[56rem]:col-span-2 @max-[56rem]:whitespace-normal',
  actions: 'w-px text-end @max-[56rem]:w-auto @max-[56rem]:col-span-2 @max-[56rem]:pt-1 @max-[56rem]:text-start',
} as const;
const inlineLabel = 'hidden @max-[56rem]:inline';
const paidColumn = '@min-[56rem]:@max-[64rem]:hidden';

const mainAction = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), '@min-[56rem]:text-nowrap');
const nameTooltip =
  "after:pointer-events-none after:absolute after:top-full after:right-0 after:z-20 after:mt-1 after:hidden after:rounded-sm after:bg-surface-inverse after:px-2 after:py-1 after:text-caption after:font-medium after:whitespace-nowrap after:text-text-inverse after:shadow-md after:content-[attr(data-label)_/_''] @min-[56rem]:hover:after:block @min-[56rem]:focus-visible:after:block";
const sideAction = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'relative @min-[56rem]:min-w-control-sm @min-[56rem]:px-0 @min-[56rem]:pointer-coarse:min-w-touch',
  nameTooltip,
);
const sideLabel = '@min-[56rem]:sr-only';

function DueCell({ item, month, asOf }: { item: CollectionItem<CollectionRow>; month: IsoDate; asOf: IsoDate }) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { row, carriedFrom, state } = item;
  return (
    <span className="flex flex-col @max-[56rem]:flex-row @max-[56rem]:flex-wrap @max-[56rem]:gap-x-2">
      <span data-testid="row-due" className="num">
        <span className={inlineLabel}>{t('duePrefix')} </span>
        {formatDate(row.dueDate, locale)}
      </span>
      {carriedFrom === null ? null : (
        <span data-testid="carried-from" className="text-body-sm font-medium text-text-secondary">
          {t('carriedFrom', { month: formatMonthWithin(carriedFrom, month, locale) })}
        </span>
      )}
      {state.group === 'notDue' ? <span className="text-body-sm text-text-muted">{formatRelativeDue(row.dueDate, asOf, locale)}</span> : null}
    </span>
  );
}

function StatusCell({ item }: { item: CollectionItem<CollectionRow> }) {
  const t = useTranslations('collections');
  const { state, row } = item;
  return (
    <span className="flex w-max flex-col items-start gap-1 @max-[56rem]:w-auto @max-[56rem]:flex-row @max-[56rem]:flex-wrap @max-[56rem]:items-center @max-[56rem]:gap-x-2">
      {state.group === 'overdue' ? <StatusMark status="overdue" days={state.days} /> : <StatusMark status={GROUP_MARKS[state.group]} />}
      {row.paymentStatus === 'partial' ? (
        <span data-testid="row-partial" className="text-body-sm font-medium text-text-secondary">
          {t('partial')}
        </span>
      ) : null}
    </span>
  );
}

function RowActions({ item, place, context }: { item: CollectionItem<CollectionRow>; place: string; context: BoardRowContext }) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { row } = item;
  const qr = context.qrs.byInvoice.get(row.invoiceId);
  const reminder = context.reminders.byInvoice.get(row.invoiceId);
  const shown = collectionRowActions(item, context.canEdit).filter((action) => (action.kind === 'qr' ? qr !== undefined : action.kind !== 'remind' || reminder !== undefined));
  return (
    <span className="inline-flex flex-wrap items-center gap-1 @min-[56rem]:flex-nowrap">
      {shown.map((action, index) => {
        const className = index === 0 ? mainAction : sideAction;
        const labelClassName = index === 0 ? undefined : sideLabel;
        const label = t(action.label);
        switch (action.kind) {
          case 'link':
            return (
              <Link key={action.id} href={action.href(row)} data-testid={`row-action-${action.id}`} data-label={label} className={className}>
                <FileText aria-hidden="true" />
                <span className={labelClassName}>{label}</span>
              </Link>
            );
          case 'qr':
            return qr === undefined ? null : (
              <QrAction
                key={action.id}
                label={label}
                title={place}
                description={t('qrDescription', { number: row.number, date: formatDate(row.dueDate, locale) })}
                invoiceHref={`/collections/invoices/${row.invoiceId}`}
                qr={qr}
                labels={context.qrs.labels}
                className={className}
                labelClassName={labelClassName}
              />
            );
          case 'remind':
            return reminder === undefined ? null : (
              <ReminderAction key={action.id} label={label} title={place} target={reminder} labels={context.reminders.labels} className={className} labelClassName={labelClassName} />
            );
          case 'recordPayment':
            return (
              <RecordPaymentAction
                key={action.id}
                label={label}
                className={className}
                target={{
                  invoiceId: row.invoiceId,
                  place,
                  shortPlace: row.wholeUnit ? row.propertyName : row.unitLabel,
                  tenantName: row.tenantName,
                  openInvoices: context.openInvoices.get(row.leaseId) ?? [],
                  today: context.asOf,
                  account: context.qrs.account,
                }}
              />
            );
        }
      })}
    </span>
  );
}

function CollectionsRow({ item, context }: { item: CollectionItem<CollectionRow>; context: BoardRowContext }) {
  const t = useTranslations('collections');
  const { row } = item;
  const place = row.wholeUnit ? row.propertyName : t('place', { unit: row.unitLabel, property: row.propertyName });
  const tenant = row.tenantName ?? t('noTenant');
  return (
    <TableRow
      data-testid="collections-row"
      data-group={item.state.group}
      className="hover:bg-bg-subtle @max-[56rem]:grid @max-[56rem]:grid-cols-[minmax(0,1fr)_auto] @max-[56rem]:gap-x-3 @max-[56rem]:gap-y-1.5 @max-[56rem]:border-b @max-[56rem]:border-border @max-[56rem]:px-4 @max-[56rem]:py-3.5"
    >
      <TableCell className={cn(list, cell.place)}>
        <span className="flex min-w-0 flex-col" title={`${place} · ${tenant}`}>
          <span data-testid="row-place" className="truncate font-medium text-text @max-[56rem]:whitespace-normal @max-[56rem]:break-words">
            {place}
          </span>
          <span data-testid="row-tenant" className="truncate text-body-sm text-text-secondary @max-[56rem]:whitespace-normal @max-[56rem]:break-words">
            {tenant}
          </span>
          {row.propertyArchived ? (
            <span data-testid="row-archived" className="truncate text-body-sm font-medium text-text-secondary @max-[56rem]:whitespace-normal">
              {t('propertyArchived')}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className={cn(list, cell.due)}>
        <DueCell item={item} month={context.month} asOf={context.asOf} />
      </TableCell>
      <TableCell data-testid="row-owed" className={cn(list, cell.owed)}>
        <MoneyDisplay amount={row.outstandingVnd} className="font-medium" />
      </TableCell>
      <TableCell data-testid="row-paid" className={cn(list, cell.paid, paidColumn, row.allocatedVnd === 0 && '@max-[56rem]:hidden')}>
        <span className={inlineLabel}>{t('paidPrefix')} </span>
        <MoneyDisplay amount={row.allocatedVnd} />
      </TableCell>
      <TableCell className={cn(list, cell.status)}>
        <StatusCell item={item} />
      </TableCell>
      <TableCell className={cn(list, cell.actions)}>
        <RowActions item={item} place={place} context={context} />
      </TableCell>
    </TableRow>
  );
}

function TotalRow({ totals }: { totals: BoardTotals }) {
  const t = useTranslations('collections');
  const foot = 'h-row-h bg-bg-subtle px-cell-x py-1.5 align-middle font-medium text-text @max-[56rem]:h-auto @max-[56rem]:bg-transparent @max-[56rem]:p-0';
  return (
    <tfoot data-testid="collections-total" className="@max-[56rem]:block">
      <tr className="@max-[56rem]:flex @max-[56rem]:flex-wrap @max-[56rem]:items-baseline @max-[56rem]:justify-between @max-[56rem]:gap-x-4 @max-[56rem]:gap-y-1 @max-[56rem]:rounded-b-lg @max-[56rem]:bg-bg-subtle @max-[56rem]:px-4 @max-[56rem]:py-3">
        <th scope="row" colSpan={2} className={cn(foot, 'rounded-bl-lg text-start @max-[56rem]:basis-full')}>
          <span data-testid="total-count">{t('totalLabel', { count: totals.count })}</span>
        </th>
        <td data-testid="total-owed" className={cn(foot, 'text-end whitespace-nowrap')}>
          <span className={inlineLabel}>{t('owedPrefix')} </span>
          <MoneyDisplay amount={totals.owedVnd} />
        </td>
        <td aria-hidden="true" className={cn(foot, '@max-[64rem]:hidden')} />
        <td colSpan={2} aria-hidden="true" className={cn(foot, 'rounded-br-lg @max-[56rem]:hidden')} />
      </tr>
    </tfoot>
  );
}

const COLUMNS = ['colPlace', 'colDue', 'colOwed', 'colPaid', 'colStatus', 'colActions'] as const;

/** LSE-10's bills under one status tab, in the order Mẹ reads them, each group its own row group, and their total. */
export function CollectionsBoard({ groups, totals, caption, context }: { groups: readonly CollectionGroup<CollectionRow>[]; totals: BoardTotals; caption: string; context: BoardRowContext }) {
  const t = useTranslations('collections');
  return (
    <div data-testid="collections-board" className="@container rounded-lg border border-border bg-surface shadow-xs">
      <Table className="@max-[56rem]:block">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="@max-[56rem]:sr-only">
          <TableRow>
            {COLUMNS.map((key, index) => (
              <TableHead
                key={key}
                scope="col"
                className={cn('sticky top-0 z-10', index === 0 && 'rounded-tl-lg', index === COLUMNS.length - 1 && 'rounded-tr-lg', (key === 'colOwed' || key === 'colPaid') && 'text-end', key === 'colPaid' && paidColumn)}
              >
                {key === 'colActions' ? <span className="sr-only">{t(key)}</span> : t(key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <TableBody key={group.key} data-testid={`group-${group.key}`} className="@max-[56rem]:block">
              {group.items.map((item) => (
                <CollectionsRow key={item.row.invoiceId} item={item} context={context} />
              ))}
            </TableBody>
          ),
        )}
        <TotalRow totals={totals} />
      </Table>
    </div>
  );
}
