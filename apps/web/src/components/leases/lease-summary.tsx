import { formatDate, formatVnd } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState } from '@/components/empty-state';
import type { InvoiceSummary, LeaseWithTenant } from '@/server/leases/load';
import { InvoiceRow } from './invoice-row';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-small text-ink-muted sm:w-40 sm:shrink-0 sm:text-body">{label}</dt>
      <dd className="min-w-0 text-body break-words text-ink">{children}</dd>
    </div>
  );
}

/**
 * A lease that is no longer a draft, or any lease a viewer opens: its terms and its invoices (P3-08 adds the timeline).
 * On a phone the invoices come first, because they are what Mẹ acts on right after activating.
 */
export function LeaseSummary({ lease, unitLabel, invoices, asOf }: { lease: LeaseWithTenant; unitLabel: string; invoices: readonly InvoiceSummary[]; asOf: IsoDate }) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const money = (amount: Vnd | null) => (amount === null ? t('none') : formatVnd(amount, locale));
  const start = lease.start_date === null ? t('none') : formatDate(lease.start_date, locale);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <section aria-labelledby="lease-terms" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <h2 id="lease-terms" className="text-lead font-bold text-ink">
          {t('termsTitle')}
        </h2>
        <dl className="flex flex-col gap-3">
          <Fact label={t('tenantLabel')}>
            <span data-testid="lease-tenant-name">{lease.tenant?.fullName ?? t('none')}</span>
            {lease.tenant?.phone == null ? null : <span className="block figures text-ink-2">{lease.tenant.phone}</span>}
          </Fact>
          <Fact label={t('unitLabel')}>{unitLabel}</Fact>
          <Fact label={t('periodLabel')}>
            {lease.end_date === null ? t('openEnded', { start }) : t('fromTo', { start, end: formatDate(lease.end_date, locale) })}
          </Fact>
          <Fact label={t('rentLabel')}>
            <span className="figures">{lease.rent_vnd === null ? t('none') : t('rentPerMonth', { rent: formatVnd(lease.rent_vnd, locale), months: lease.billing_cycle_months })}</span>
          </Fact>
          <Fact label={t('depositLabel')}>
            <span className="figures">{money(lease.deposit_vnd)}</span>
          </Fact>
          <Fact label={t('paidThroughLabel')}>{lease.paid_through_date === null ? t('none') : formatDate(lease.paid_through_date, locale)}</Fact>
          <Fact label={t('utilitiesLabel')}>{t('utilities', { mode: lease.utilities_mode })}</Fact>
          <Fact label={t('taxLabel')}>{t('taxPayer', { payer: lease.tax_payer })}</Fact>
        </dl>
      </section>
      <section aria-labelledby="lease-invoices" className="order-first flex flex-col gap-3 lg:order-none">
        <h2 id="lease-invoices" className="text-h3 text-ink">
          {t('invoicesTitle')}
        </h2>
        {invoices.length === 0 ? (
          <EmptyState title={t('invoicesEmpty')} body={t('invoicesEmptyBody')} icon={FileText} />
        ) : (
          <ol data-testid="invoice-list" className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
            {invoices.toReversed().map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} asOf={asOf} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
