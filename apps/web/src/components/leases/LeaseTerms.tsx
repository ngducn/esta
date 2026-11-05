import { formatBps, formatDate, formatVnd } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { collectedThrough, currentMonthlyRent } from '@esta/core/lease';
import type { Vnd } from '@esta/core/money';
import type { LeaseAmendmentRow } from '@esta/core/schemas/lease';
import type { SchedulePeriod } from '@esta/core/schedule';
import { toEscalation } from '@esta/core/schemas/lease';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { InvoiceSummary, LeaseWithTenant } from '@/server/leases/load';

function Fact({ label, testId, children }: { label: string; testId?: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-body-sm text-text-muted sm:w-40 sm:shrink-0 sm:text-body">{label}</dt>
      <dd className="min-w-0 text-body break-words text-text">{children}</dd>
    </div>
  );
}

export type LeaseLink = { readonly href: string; readonly startDate: IsoDate | null };

/**
 * LSE-2: what the lease says, with the rent in force on the Clock's date after increases and amendments, the deposit from
 * its terms, and how it ended or was renewed.
 */
export function LeaseTerms({
  lease,
  unitLabel,
  invoices,
  schedule,
  amendments,
  asOf,
  renewalOf,
  renewedBy,
  tenantHref = null,
}: {
  lease: LeaseWithTenant;
  unitLabel: string;
  invoices: readonly InvoiceSummary[];
  schedule: readonly SchedulePeriod[];
  amendments: readonly LeaseAmendmentRow[];
  asOf: IsoDate;
  renewalOf: LeaseLink | null;
  renewedBy: LeaseLink | null;
  tenantHref?: string | null;
}) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const money = (amount: Vnd | null) => (amount === null ? t('none') : formatVnd(amount, locale));
  const start = lease.start_date === null ? t('none') : formatDate(lease.start_date, locale);
  const collected = collectedThrough(lease.paid_through_date, invoices);
  const rentNow = currentMonthlyRent(schedule, asOf) ?? lease.rent_vnd;
  const escalation = toEscalation(lease.escalation);
  const rentChanges = amendments.flatMap((amendment) => (amendment.changes.rentVnd === undefined ? [] : [{ ...amendment, rentVnd: amendment.changes.rentVnd }]));
  return (
    <section aria-labelledby="lease-terms" data-testid="lease-terms" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
      <h2 id="lease-terms" className="text-headline font-semibold text-text">
        {t('termsTitle')}
      </h2>
      <dl className="flex flex-col gap-3">
        <Fact label={t('tenantLabel')}>
          {tenantHref === null || lease.tenant === null ? (
            <span data-testid="lease-tenant-name">{lease.tenant?.fullName ?? t('none')}</span>
          ) : (
            <Link href={tenantHref} data-testid="lease-tenant-name" className="font-medium text-accent-text underline underline-offset-4">
              {lease.tenant.fullName}
            </Link>
          )}
          {lease.tenant?.phone == null ? null : <span className="block num text-text-secondary">{lease.tenant.phone}</span>}
        </Fact>
        <Fact label={t('unitLabel')}>{unitLabel}</Fact>
        <Fact label={t('periodLabel')} testId="lease-period">
          {lease.end_date === null ? t('openEnded', { start }) : t('fromTo', { start, end: formatDate(lease.end_date, locale) })}
        </Fact>
        <Fact label={t('rentNowLabel')} testId="lease-rent">
          <span className="num">{rentNow === null ? t('none') : t('rentPerMonth', { rent: formatVnd(rentNow, locale), months: lease.billing_cycle_months })}</span>
        </Fact>
        {rentChanges.length === 0 ? null : (
          <Fact label={t('amendmentsLabel')} testId="lease-amendments">
            <ul className="flex flex-col gap-1">
              {rentChanges.map((change) => (
                <li key={change.id} className="num">
                  {t('amendmentLine', { date: formatDate(change.effectivePeriodStart, locale), rent: formatVnd(change.rentVnd, locale) })}
                  {change.reason === null ? null : <span className="block text-body-sm text-text-secondary">{change.reason}</span>}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        <Fact label={t('depositLabel')} testId="lease-deposit">
          <span className="num">{money(lease.deposit_vnd)}</span>
        </Fact>
        <Fact label={t('escalationLabel')}>
          {escalation.kind === 'none'
            ? t('escalationNone')
            : escalation.kind === 'percent'
              ? t('escalationPercentLine', { percent: formatBps(escalation.valueBps, locale), months: escalation.everyMonths })
              : t('escalationFixedLine', { amount: formatVnd(escalation.valueVnd, locale), months: escalation.everyMonths })}
        </Fact>
        <Fact label={t('paidThroughLabel')}>
          <span data-testid="lease-paid-through">{collected === null ? t('none') : formatDate(collected, locale)}</span>
        </Fact>
        <Fact label={t('utilitiesLabel')}>{t('utilities', { mode: lease.utilities_mode })}</Fact>
        <Fact label={t('taxLabel')} testId="lease-tax">
          {t('taxPayer', { payer: lease.tax_payer })}
        </Fact>
        {lease.status === 'terminated' && lease.terminated_on !== null ? (
          <Fact label={t('terminationLabel')} testId="lease-termination">
            {t('terminationLine', { date: formatDate(lease.terminated_on, locale), reason: lease.termination_reason ?? t('none') })}
          </Fact>
        ) : null}
        {renewalOf === null ? null : (
          <Fact label={t('renewalOfLabel')}>
            <Link href={renewalOf.href} data-testid="lease-renewal-of" className="font-medium text-accent-text underline underline-offset-4">
              {t('renewalOf')}
            </Link>
          </Fact>
        )}
        {renewedBy === null || renewedBy.startDate === null ? null : (
          <Fact label={t('renewedByLabel')}>
            <Link href={renewedBy.href} data-testid="lease-renewed-by" className="font-medium text-accent-text underline underline-offset-4">
              {t('renewedBy', { date: formatDate(renewedBy.startDate, locale) })}
            </Link>
          </Fact>
        )}
      </dl>
    </section>
  );
}
