import { openInvoicesOldestFirst } from '@esta/core/allocation';
import { formatVnd } from '@esta/core/format';
import { currentLease, currentMonthlyRent, unitLeaseMark } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { Gauge, Plug, Plus } from 'lucide-react';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import type { IsoDate } from '@esta/core/date';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { PropertyIntl } from '@/components/properties/property-intl';
import { SummaryStrip } from '@/components/summary-strip';
import { UnitList, type UnitLease } from '@/components/rental/unit-list';
import { UtilityAccountList } from '@/components/rental/utility-account-list';
import { buttonVariants } from '@/components/ui/button-variants';
import { getClock } from '@/server/clock';
import { loadPropertyLeases, type PropertyLeases } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { propertyHasMeters } from '@/server/meters/load';
import { loadPropertyDetail } from '@/server/properties/detail';
import { loadPropertyRental } from '@/server/properties/rental';
import { PropertyDetailFrame } from '../detail-frame';

const roomCountSchema = z.object({ room_count: z.number().int().min(1) });

/** Each unit's current lease on the Clock's date, marked by its oldest issued invoice still owed, at the rent its period bills. */
function unitLeases(units: readonly { id: string }[], { leases, invoices, schedule }: PropertyLeases, asOf: IsoDate): Record<string, UnitLease> {
  return Object.fromEntries(
    units.map((unit) => {
      const live = currentLease(leases.filter((lease) => lease.unit_id === unit.id), asOf);
      if (live === undefined) return [unit.id, { mark: unitLeaseMark(undefined, asOf), leaseId: null, tenantName: null, rentVnd: null, endsOn: null }];
      const openDueDates = openInvoicesOldestFirst(invoices.filter((invoice) => invoice.leaseId === live.id)).map((invoice) => invoice.dueDate);
      return [
        unit.id,
        {
          mark: unitLeaseMark({ status: live.status, openDueDates }, asOf),
          leaseId: live.id,
          tenantName: live.tenant?.fullName ?? null,
          rentVnd: currentMonthlyRent(schedule.filter((period) => period.leaseId === live.id), asOf) ?? live.rent_vnd,
          endsOn: live.status === 'terminated' ? live.end_date : null,
        },
      ];
    }),
  );
}

export default async function PropertyRentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const asOf = (await getClock()).today();
  const [member, rental, leases, metered, t, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyRental(id),
    loadPropertyLeases(id, asOf),
    propertyHasMeters(id),
    getTranslations('propertyRental'),
    getLocale(),
    getMessages(),
  ]);
  const canEdit = member.can('edit');
  const roomingHouse = property.kind === 'rooming_house';
  const declared = roomingHouse ? (roomCountSchema.safeParse(property.kindDetails).data?.room_count ?? null) : null;
  const rooms = rental.units.filter((unit) => unit.kind === 'room').length;
  const rents = rental.units.flatMap((unit) => (unit.list_rent_vnd === null ? [] : [unit.list_rent_vnd]));
  const total = rents.length === 0 ? null : vnd(rents.reduce((sum, rent) => sum + rent, 0));
  const onlyWhole = rental.units.length === 1 && rental.units[0]?.kind === 'whole';
  const addAccount = canEdit ? { href: `/properties/${id}/rental/accounts/new`, label: t('addAccount') } : null;
  const { money, date, status } = messages.components;
  const unitLease = unitLeases(rental.units, leases, asOf);
  const owed = Object.values(unitLease).filter(({ mark }) => mark.kind === 'overdue' || mark.kind === 'due').length;

  return (
    <PropertyDetailFrame property={property} tab="rental">
      <SummaryStrip
        label={t('stripLabel')}
        unknownLabel={t('unknownFigure')}
        figures={[
          {
            label: t('figureLeased'),
            value: property.unitCount === 0 ? null : t('figureLeasedValue', { leased: property.leasedUnitCount, total: property.unitCount }),
            sub: t('figureLeasedSub'),
          },
          { label: t('figureOwed'), value: t('figureOwedValue', { count: owed }), sub: owed === 0 ? t('figureOwedNone') : t('figureOwedSub') },
        ]}
      />
      <PropertyIntl locale={locale} messages={{ propertyRental: messages.propertyRental, components: { money, date, status } }}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <section aria-labelledby="rental-units" data-testid="rental-units" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="rental-units" className="text-title-3 text-text">
                {t('unitsTitle')}
              </h2>
              {total === null ? null : (
                <p data-testid="rental-total" className="text-body-sm text-text-muted">
                  {t('totalRent')} <span className="num text-body font-medium text-text">{formatVnd(total, locale)}</span>
                </p>
              )}
            </div>
            {metered ? (
              <Link href={`/properties/${id}/rental/meters`} data-testid="enter-readings" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
                <Gauge aria-hidden="true" />
                {t('enterReadings')}
              </Link>
            ) : null}
            {declared === null || declared === rooms ? null : (
              <p data-testid="room-count-mismatch" className="text-body text-text-secondary">
                {t('roomCountMismatch', { declared, actual: rooms })}
              </p>
            )}
            {onlyWhole && canEdit ? <p className="max-w-prose text-body text-text-secondary">{t('wholeHint')}</p> : null}
            <UnitList propertyId={id} units={rental.units} leases={unitLease} canEdit={canEdit} roomingHouse={roomingHouse} />
          </section>
          <section aria-labelledby="rental-accounts" data-testid="rental-accounts" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <h2 id="rental-accounts" className="text-title-3 text-text">
                {t('accountsTitle')}
              </h2>
              {addAccount === null || rental.accounts.length === 0 ? null : (
                <Link href={addAccount.href} data-testid="add-account" className={buttonVariants({ variant: 'secondary' })}>
                  <Plus aria-hidden="true" />
                  {addAccount.label}
                </Link>
              )}
            </div>
            {rental.accounts.length === 0 ? (
              <RegistryEmptyState surface="propertyRentalAccounts" ctx={{ canWrite: canEdit, propertyId: id }} icon={Plug} />
            ) : (
              <UtilityAccountList propertyId={id} accounts={rental.accounts} units={rental.units} canEdit={canEdit} />
            )}
          </section>
        </div>
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
