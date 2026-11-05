import { formatDate } from '@esta/core/format';
import { REDACTED_NAME } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/properties/back-link';
import { IntentLink } from '@/components/shell/intent-link';
import { TenantActions, type TenantActionLabels } from '@/components/tenants/TenantActions';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { loadTenantPage } from '@/server/tenants/load';

type Params = Promise<{ partyId: string }>;

export default async function TenantPage({ params }: { params: Params }) {
  const member = await requireMember();
  if (member.role !== 'admin') notFound();
  const [{ partyId }, t, leasesT, locale] = await Promise.all([params, getTranslations('tenants'), getTranslations('leases'), getLocale()]);
  const tenant = await loadTenantPage(partyId);
  if (tenant === null) notFound();

  const erased = tenant.fullName === REDACTED_NAME;
  const minutes = Math.max(1, Math.round(env.ESTA_SIGNED_URL_TTL_SECONDS / 60));
  const name = tenant.fullName;
  const first = tenant.leases[0];
  const facts: readonly { readonly key: string; readonly label: string; readonly value: string | null }[] = [
    { key: 'phone', label: t('phone'), value: tenant.phone },
    { key: 'email', label: t('email'), value: tenant.email },
    { key: 'idLast4', label: t('idLast4'), value: tenant.idLast4 },
    { key: 'address', label: t('address'), value: tenant.addressText },
    { key: 'notes', label: t('notes'), value: tenant.notes },
  ];
  const labels: TenantActionLabels = {
    export: {
      start: t('exportStart'),
      preparing: '',
      ready: t('exportReady', { minutes }),
      readyPart: t('exportReadyPart', { part: '{part}', total: '{total}', minutes }),
      manyParts: '',
      failed: '',
    },
    exportTitle: t('exportTitle'),
    exportIntro: t('exportIntro'),
    eraseTitle: t('eraseTitle'),
    eraseIntro: t('eraseIntro'),
    eraseStart: t('eraseStart'),
    finishTitle: t('finishTitle'),
    finishIntro: t('finishIntro'),
    finishStart: t('finishStart'),
    finish: {
      question: t('finishQuestion'),
      body: t('finishBody'),
      confirm: t('finishConfirm'),
      cancel: t('eraseCancel'),
      working: t('eraseWorking'),
      refusals: {
        active_lease: t('refusal', { reason: 'active_lease', name }),
        deposit_held: t('refusal', { reason: 'deposit_held', name }),
        files_left: t('refusal', { reason: 'files_left', name }),
        failed: t('refusal', { reason: 'other', name }),
      },
    },
    erase: {
      question: t('eraseQuestion', { name }),
      body: t('eraseBody'),
      confirm: t('eraseConfirm'),
      cancel: t('eraseCancel'),
      working: t('eraseWorking'),
      refusals: {
        active_lease: t('refusal', { reason: 'active_lease', name }),
        deposit_held: t('refusal', { reason: 'deposit_held', name }),
        files_left: t('refusal', { reason: 'files_left', name }),
        failed: t('refusal', { reason: 'other', name }),
      },
    },
  };
  return (
    <div className="flex flex-col gap-5">
      <BackLink href={first === undefined ? '/properties' : `/properties/${first.propertyId}/rental`} label={first?.propertyName ?? t('backToProperties')} />
      <h1 data-testid="tenant-name" className="text-title-2 break-words text-balance lg:text-title-1">
        {name}
      </h1>
      {erased ? (
        <p role="status" data-testid="tenant-erased" className="text-body text-text-secondary">
          {t('erasedNote')}
        </p>
      ) : (
        <section aria-labelledby="tenant-contact" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
          <h2 id="tenant-contact" className="text-headline font-semibold text-text">
            {t('contactTitle')}
          </h2>
          <dl className="flex flex-col gap-3">
            {facts.map((fact) => (
              <div key={fact.key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <dt className="text-body-sm text-text-muted sm:w-40 sm:shrink-0 sm:text-body">{fact.label}</dt>
                <dd className="min-w-0 text-body break-words text-text">{fact.value ?? t('none')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section aria-labelledby="tenant-leases" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
        <h2 id="tenant-leases" className="text-headline font-semibold text-text">
          {t('leasesTitle')}
        </h2>
        {tenant.leases.length === 0 ? (
          <p className="text-body text-text-secondary">{t('leasesEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tenant.leases.map((lease) => (
              <li key={lease.id} data-testid="tenant-lease" className="flex flex-col gap-1">
                <IntentLink href={`/properties/${lease.propertyId}/rental/leases/${lease.id}`} className="w-fit min-h-touch font-medium text-accent-text underline underline-offset-4">
                  {t('leaseUnit', { unit: lease.unitLabel, property: lease.propertyName })}
                </IntentLink>
                <span className="text-body-sm text-text-secondary">{leasesT('status', { status: lease.status })}</span>
                {lease.startDate === null ? null : (
                  <span className="text-body-sm text-text-secondary">
                    {lease.endDate === null ? t('leasePeriodOpen', { start: formatDate(lease.startDate, locale) }) : t('leasePeriod', { start: formatDate(lease.startDate, locale), end: formatDate(lease.endDate, locale) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <TenantActions partyId={tenant.id} canExport={!erased} canErase={!erased} canFinish={erased && tenant.filesLeft > 0} labels={labels} />
    </div>
  );
}
