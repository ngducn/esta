import { formatDate } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { unitLeaseMark } from '@esta/core/lease';
import { useLocale, useTranslations } from 'next-intl';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatusMark } from '@/components/status-mark';
import type { InvoiceSummary } from '@/server/leases/load';

/** One invoice: its number, period, due date, total and where it stands on the Clock's date. */
export function InvoiceRow({ invoice, asOf }: { invoice: InvoiceSummary; asOf: IsoDate }) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const settled = invoice.status === 'issued' && invoice.outstandingVnd === 0;
  const mark =
    invoice.status === 'draft' ? { kind: 'draft' as const } : unitLeaseMark([{ status: 'active', openDueDates: settled ? [] : [invoice.dueDate] }], asOf);
  return (
    <li data-testid="invoice-row" data-status={invoice.status} className="flex flex-col gap-2 border-b border-rule p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold text-ink">
          {t('invoicePeriod', { start: formatDate(invoice.periodStart, locale), end: formatDate(invoice.periodEnd, locale) })}
        </p>
        <p className="text-small text-ink-muted">
          <span className="figures">{invoice.number}</span>
          {' · '}
          {invoice.status === 'draft' ? t('invoiceDraft', { date: formatDate(invoice.issueOn, locale) }) : t('invoiceDue', { date: formatDate(invoice.dueDate, locale) })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {mark.kind === 'overdue' ? <StatusMark status="overdue" days={mark.days} /> : null}
        {mark.kind === 'due' ? <StatusMark status="due" /> : null}
        {mark.kind === 'draft' ? <StatusMark status="draft" /> : null}
        {settled ? <StatusMark status="paid" /> : null}
        <MoneyDisplay amount={invoice.totalVnd} className="text-lead font-bold text-ink" />
      </div>
    </li>
  );
}
