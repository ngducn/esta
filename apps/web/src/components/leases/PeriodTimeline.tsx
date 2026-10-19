import { formatDate } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { leaseTimeline, type PeriodMark, type TimelineRow } from '@esta/core/lease';
import { addMonths, generateSchedule, type Amendment, type LeaseTerms } from '@esta/core/schedule';
import { useLocale, useTranslations } from 'next-intl';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatusMark, StatusShape, statusMarks } from '@/components/status-mark';
import { cn } from '@/lib/utils';
import type { InvoiceSummary } from '@/server/leases/load';

/** Settled periods before these many stay folded away, so the open ones lead on a phone. */
const SETTLED_SHOWN = 3;

/** Periods ahead with no invoice yet shown before the rest fold away, so the terms stay near on a phone. */
const UPCOMING_SHOWN = 2;

function Mark({ mark }: { mark: PeriodMark }) {
  const t = useTranslations('leases');
  switch (mark.kind) {
    case 'overdue':
      return <StatusMark status="overdue" days={mark.days} />;
    case 'paid':
    case 'due':
    case 'upcoming':
    case 'draft':
      return <StatusMark status={mark.kind} />;
    case 'prepaid':
    case 'partial':
    case 'unbilled': {
      const shape = mark.kind === 'prepaid' ? 'paid' : mark.kind === 'partial' ? 'due' : 'upcoming';
      const word = mark.kind === 'prepaid' ? t('markPrepaid') : mark.kind === 'partial' ? t('markPartial') : t('markUnbilled');
      return (
        <span data-status={mark.kind} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 align-top text-small font-semibold', statusMarks[shape].pill)}>
          <StatusShape status={shape} className="size-4" />
          <span>{word}</span>
        </span>
      );
    }
  }
}

function PeriodRow({ row, newRent }: { row: TimelineRow<InvoiceSummary>; newRent: boolean }) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const { invoice } = row;
  return (
    <li
      data-testid={invoice === null ? 'period-row' : 'invoice-row'}
      data-period-start={row.start}
      data-mark={row.mark.kind}
      className="flex flex-col gap-2 border-b border-rule p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold break-words text-ink">{t('invoicePeriod', { start: formatDate(row.start, locale), end: formatDate(row.end, locale) })}</p>
        <p className="text-small break-words text-ink-muted">
          {invoice === null ? null : (
            <>
              <span className="figures">{invoice.number}</span>
              {' · '}
            </>
          )}
          {invoice?.status === 'draft' ? t('invoiceDraft', { date: formatDate(invoice.issueOn, locale) }) : t('invoiceDue', { date: formatDate(row.dueDate, locale) })}
        </p>
        {newRent ? (
          <p data-testid="period-new-rent" className="text-small font-semibold text-accent">
            {t('timelineNewRent')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <Mark mark={row.mark} />
        <MoneyDisplay amount={row.amountVnd} className="text-lead font-bold text-ink" />
      </div>
    </li>
  );
}

/**
 * LSE-3 on screen: every period `generateSchedule` plans through the end date or a year ahead, each beside the invoice
 * that bills it and its payment mark on the Clock's date. Older settled periods fold under one disclosure.
 */
export function PeriodTimeline({
  terms,
  amendments,
  invoices,
  asOf,
}: {
  terms: LeaseTerms;
  amendments: readonly Amendment[];
  invoices: readonly InvoiceSummary[];
  asOf: IsoDate;
}) {
  const t = useTranslations('leases');
  const yearAhead = addMonths(asOf, 12);
  const until = terms.endDate !== null && terms.endDate < yearAhead ? terms.endDate : yearAhead;
  const rows = leaseTimeline(generateSchedule(terms, amendments, until), invoices, asOf);
  const settled = (row: TimelineRow<InvoiceSummary>) => (row.mark.kind === 'paid' || row.mark.kind === 'prepaid') && row.end < asOf;
  const leading = rows.findIndex((row) => !settled(row));
  const folded = Math.max(0, (leading === -1 ? rows.length : leading) - SETTLED_SHOWN);
  const upcoming = rows.findIndex((row) => row.invoice === null && row.start > asOf);
  const later = upcoming === -1 ? rows.length : Math.max(folded, upcoming + UPCOMING_SHOWN);
  const starts = new Set(amendments.filter((amendment) => amendment.changes.rentVnd !== undefined).map((amendment) => amendment.effectivePeriodStart));
  const list = (part: readonly TimelineRow<InvoiceSummary>[]) => (
    <ol className="flex flex-col">
      {part.map((row) => (
        <PeriodRow key={row.start} row={row} newRent={starts.has(row.start)} />
      ))}
    </ol>
  );
  return (
    <section aria-labelledby="lease-timeline" className="flex flex-col gap-3">
      <h2 id="lease-timeline" className="text-h3 text-ink">
        {t('timelineTitle')}
      </h2>
      <div data-testid="lease-timeline" className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
        {folded === 0 ? null : (
          <details data-testid="timeline-earlier" className="group border-b border-rule">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-body font-semibold text-accent sm:px-5">{t('timelineEarlier', { count: folded })}</summary>
            <div className="border-t border-rule">{list(rows.slice(0, folded))}</div>
          </details>
        )}
        {list(rows.slice(folded, later))}
        {later >= rows.length ? null : (
          <details data-testid="timeline-later" className="group border-t border-rule">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-body font-semibold text-accent sm:px-5">{t('timelineLater', { count: rows.length - later })}</summary>
            <div className="border-t border-rule">{list(rows.slice(later))}</div>
          </details>
        )}
      </div>
    </section>
  );
}
