import type { IsoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import type { TodayItem, TodayList as TodayListData } from '@esta/core/today';
import { CalendarClock, FileClock, ReceiptText, ScanText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MoneyDisplay } from '@/components/money/money-display';
import { RecordPaymentAction, type PaymentIntl } from '@/components/payments/RecordPaymentAction';
import type { PaymentAccount } from '@/components/payments/RecordPaymentSheet';
import { StatusMark } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import type { PaymentInvoice } from '@/server/collections/load';
import type { HomeSnapshot } from '@/server/home/load';

type Item = TodayItem<HomeSnapshot>;

/** What `Ghi nhận` needs, for a member who may record a payment. */
export type TodayPayment = {
  readonly intl: PaymentIntl;
  readonly openInvoices: ReadonlyMap<string, readonly PaymentInvoice[]>;
  readonly account: PaymentAccount | null;
};

const iconClass = 'size-5 shrink-0 text-ink-muted';
const leasePath = (item: Extract<Item, { rule: 'lease_ending' }>) => `/properties/${item.lease.propertyId}/rental/leases/${item.lease.leaseId}`;

function itemKey(item: Item): string {
  switch (item.rule) {
    case 'overdue_invoice':
    case 'due_today':
      return `${item.rule}:${item.bill.invoiceId}`;
    case 'lease_ending':
      return `${item.rule}:${item.lease.leaseId}`;
    case 'document_expiring':
      return `${item.rule}:${item.document.documentId}`;
    case 'extraction_waiting':
      return `${item.rule}:${item.review.documentId}`;
  }
}

function ActionLink({ href, label, describedBy }: { href: string; label: string; describedBy: string }) {
  return (
    <Link href={href} prefetch={false} aria-describedby={describedBy} data-testid="today-action" className={buttonVariants({ variant: 'outline' })}>
      {label}
    </Link>
  );
}

type Row = { readonly icon: ReactNode; readonly title: string; readonly detail: ReactNode; readonly action: ReactNode };

/** One item's mark, title, reason and its one action. A viewer, who records nothing, gets a link to read the record. */
function useRow(item: Item, titleId: string, asOf: IsoDate, payment: TodayPayment | null): Row {
  const t = useTranslations('home');
  const tc = useTranslations('collections');
  const td = useTranslations('documents');
  const tx = useTranslations('extraction');
  const tl = useTranslations('leases');
  const locale = useLocale();
  switch (item.rule) {
    case 'overdue_invoice':
    case 'due_today': {
      const { bill } = item;
      const place = bill.wholeUnit ? bill.propertyName : tc('place', { unit: bill.unitLabel, property: bill.propertyName });
      return {
        icon: <ReceiptText aria-hidden="true" className={iconClass} />,
        title: place,
        detail: (
          <>
            {item.rule === 'overdue_invoice' ? <StatusMark status="overdue" days={item.days} /> : <StatusMark status="due" />}
            <MoneyDisplay amount={bill.outstandingVnd} className="text-body font-medium text-ink" />
            <span className="break-words">{bill.tenantName ?? tc('noTenant')}</span>
          </>
        ),
        action:
          payment === null ? (
            <ActionLink href={`/collections/invoices/${bill.invoiceId}`} label={t('openBill')} describedBy={titleId} />
          ) : (
            <RecordPaymentAction
              label={tc('recordPayment')}
              describedBy={titleId}
              intl={payment.intl}
              target={{
                invoiceId: bill.invoiceId,
                place,
                shortPlace: bill.wholeUnit ? bill.propertyName : bill.unitLabel,
                tenantName: bill.tenantName,
                openInvoices: payment.openInvoices.get(bill.leaseId) ?? [],
                today: asOf,
                account: payment.account,
              }}
            />
          ),
      };
    }
    case 'lease_ending':
      return {
        icon: <CalendarClock aria-hidden="true" className={iconClass} />,
        title: item.lease.wholeUnit ? item.lease.propertyName : tc('place', { unit: item.lease.unitLabel, property: item.lease.propertyName }),
        detail: <span>{t('leaseEnding', { days: item.days, date: formatDate(item.date, locale) })}</span>,
        action:
          payment === null ? (
            <ActionLink href={leasePath(item)} label={tc('openLease')} describedBy={titleId} />
          ) : (
            <ActionLink href={`${leasePath(item)}?renew=1`} label={tl('actionRenew')} describedBy={titleId} />
          ),
      };
    case 'document_expiring':
      return {
        icon: <FileClock aria-hidden="true" className={iconClass} />,
        title: item.document.title,
        detail: (
          <>
            <span className="font-medium text-ink">{td('expiry', { days: item.days })}</span>
            <span className="figures">{formatDate(item.date, locale)}</span>
          </>
        ),
        action: <ActionLink href={`/documents/${item.document.documentId}`} label={t('openDocument')} describedBy={titleId} />,
      };
    case 'extraction_waiting':
      return {
        icon: <ScanText aria-hidden="true" className={iconClass} />,
        title: item.review.title,
        detail: <span>{td('extractionWaiting')}</span>,
        action:
          payment === null ? (
            <ActionLink href={`/documents/${item.review.documentId}`} label={t('openDocument')} describedBy={titleId} />
          ) : (
            <ActionLink href={`/documents/${item.review.documentId}/review`} label={tx('reviewLink')} describedBy={titleId} />
          ),
      };
  }
}

function TodayRow({ item, titleId, asOf, payment }: { item: Item; titleId: string; asOf: IsoDate; payment: TodayPayment | null }) {
  const { icon, title, detail, action } = useRow(item, titleId, asOf, payment);
  return (
    <li
      data-testid="today-item"
      data-rule={item.rule}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
    >
      <span className="self-start pt-0.5">{icon}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p id={titleId} data-testid="today-title" className="text-body font-medium break-words text-ink">
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">{detail}</div>
      </div>
      <div className="col-start-2 sm:col-start-3">{action}</div>
    </li>
  );
}

/** `Cần làm hôm nay`: at most seven items from TODAY_RULES, each with one labelled action. */
export function TodayList({ today, asOf, payment }: { today: TodayListData<HomeSnapshot>; asOf: IsoDate; payment: TodayPayment | null }) {
  const t = useTranslations('home');
  return (
    <section aria-labelledby="today-title" data-testid="today" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="today-title" className="text-h3 text-ink">
          {t('todayTitle')}
        </h2>
        {today.total === 0 ? null : (
          <p data-testid="today-count" className="text-body font-medium text-ink-muted">
            {t('todayCount', { count: today.total })}
          </p>
        )}
      </div>
      {today.items.length === 0 ? (
        <p data-testid="today-empty" className="text-body text-ink-2">
          {t('todayEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {today.items.map((item, index) => (
            <TodayRow key={itemKey(item)} item={item} titleId={`today-item-${index}`} asOf={asOf} payment={payment} />
          ))}
        </ul>
      )}
      {today.total > today.items.length ? (
        <Link href="/collections" data-testid="today-more" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
          {t('todayMore')}
        </Link>
      ) : null}
    </section>
  );
}
