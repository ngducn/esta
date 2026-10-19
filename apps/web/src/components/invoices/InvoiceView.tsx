import { collectionState } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GROUP_MARKS } from '@/components/collections/CollectionsBoard';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatusMark, StatusShape } from '@/components/status-mark';
import { cn } from '@/lib/utils';
import type { QrMatrix } from '@/lib/qr';
import type { InvoiceDetail } from '@/server/invoices/load';
import type { InvoiceQrView } from '@/server/invoices/qr';
import { QrPanel, type QrLabels } from './QrPanel';

/** Why a bill shows no code, in the order the page checks them. */
export type QrState =
  | { readonly kind: 'shown'; readonly qr: InvoiceQrView; readonly matrix: QrMatrix; readonly labels: QrLabels }
  | { readonly kind: 'paid' | 'draft' | 'void' | 'noAccount' };

function Card({ children, className, testId }: { children: ReactNode; className?: string; testId: string }) {
  return (
    <section data-testid={testId} className={cn('rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6 print:border-0 print:p-0 print:shadow-none', className)}>
      {children}
    </section>
  );
}

function Total({ label, amount, strong = false, testId }: { label: string; amount: InvoiceDetail['totalVnd']; strong?: boolean; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={strong ? 'text-lead font-bold text-ink' : 'text-body text-ink-2'}>{label}</dt>
      <dd data-testid={testId}>
        <MoneyDisplay amount={amount} className={strong ? 'text-h3 font-bold text-ink' : 'text-body font-semibold text-ink'} />
      </dd>
    </div>
  );
}

/** LSE-5: the bill as Mẹ hands it over, with its code when something is still owed, and as it prints on A5. */
export async function InvoiceView({ invoice, qr, place, asOf, locale }: { invoice: InvoiceDetail; qr: QrState; place: string; asOf: IsoDate; locale: Locale }) {
  const t = await getTranslations('invoices');
  const state = invoice.status === 'issued' ? collectionState(invoice, asOf) : null;
  const noQrText = {
    draft: () => t('noQrDraft', { date: formatDate(invoice.issueOn, locale) }),
    void: () => t('noQrVoid', { reason: invoice.voidedReason ?? '' }),
    paid: () => t('noQrPaid'),
    noAccount: () => t('noQrNoAccount'),
  } satisfies Record<Exclude<QrState['kind'], 'shown'>, () => string>;
  return (
    <div data-print="invoice" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 data-testid="invoice-place" className="text-h2 break-words text-balance lg:text-h1 print:text-h3">
          {place}
        </h1>
        <p className="text-body text-ink-2">
          <span data-testid="invoice-number" className="figures font-semibold text-ink">
            {invoice.number}
          </span>
          {invoice.tenantName === null ? null : <span>{` · ${invoice.tenantName}`}</span>}
        </p>
        <div data-testid="invoice-status" data-status={invoice.status} className="flex flex-wrap items-center gap-2 print:hidden">
          {state === null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface-2 px-3 py-1 text-small font-semibold text-ink-muted">
              <StatusShape status={invoice.status === 'draft' ? 'draft' : 'ended'} className="size-4" />
              {t('status', { status: invoice.status })}
            </span>
          ) : state.group === 'overdue' ? (
            <StatusMark status="overdue" days={state.days} />
          ) : (
            <StatusMark status={GROUP_MARKS[state.group]} />
          )}
          {invoice.paymentStatus === 'partial' && invoice.status === 'issued' ? <span className="text-small font-semibold text-ink-2">{t('partial')}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start print:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] print:gap-6">
        <Card testId="invoice-bill" className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
            <div>
              <dt className="text-small text-ink-muted">{t('period')}</dt>
              <dd data-testid="invoice-period" className="figures text-body font-semibold text-ink">
                {t('periodValue', { start: formatDate(invoice.periodStart, locale), end: formatDate(invoice.periodEnd, locale) })}
              </dd>
            </div>
            <div>
              <dt className="text-small text-ink-muted">{t('due')}</dt>
              <dd data-testid="invoice-due" className="figures text-body font-semibold text-ink">
                {formatDate(invoice.dueDate, locale)}
              </dd>
            </div>
          </dl>
          <div>
            <h2 className="pb-1 text-lead font-bold text-ink">{t('lines')}</h2>
            <ul data-testid="invoice-lines" className="flex flex-col">
              {invoice.lines.map((line, index) => (
                <li key={index} data-testid="invoice-line" data-kind={line.kind} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5">
                  <span className="min-w-0 text-body break-words text-ink">
                    {line.description ?? t('lineKind', { kind: line.kind })}
                    {line.quantity === 1 ? null : <span className="figures block text-small text-ink-muted">{t('lineQuantity', { quantity: line.quantity, price: formatVnd(line.unitPriceVnd, locale) })}</span>}
                  </span>
                  <MoneyDisplay amount={line.amountVnd} className="text-body font-semibold text-ink" />
                </li>
              ))}
            </ul>
          </div>
          <dl className="flex flex-col">
            <Total label={t('total')} amount={invoice.totalVnd} testId="invoice-total" />
            <Total label={t('allocated')} amount={invoice.allocatedVnd} testId="invoice-allocated" />
            <Total label={t('outstanding')} amount={invoice.outstandingVnd} strong testId="invoice-outstanding" />
          </dl>
        </Card>

        <Card testId="invoice-qr" className="order-first lg:order-none print:order-none">
          {qr.kind === 'shown' ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-lead font-bold text-ink">{t('qrTitle')}</h2>
              <QrPanel qr={qr.qr} matrix={qr.matrix} labels={qr.labels} />
            </div>
          ) : (
            <p data-testid="invoice-no-qr" data-reason={qr.kind} className="text-body text-ink-2">
              {noQrText[qr.kind]()}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
