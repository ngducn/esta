import { formatVnd } from '@esta/core/format';
import { currentLease, currentMonthlyRent, unitLeaseMark } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { Plug, Plus } from 'lucide-react';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import type { IsoDate } from '@esta/core/date';
import { EmptyState } from '@/components/empty-state';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UnitList, type UnitLease } from '@/components/rental/unit-list';
import { UtilityAccountList } from '@/components/rental/utility-account-list';
import { buttonVariants } from '@/components/ui/button-variants';
import { getClock } from '@/server/clock';
import { loadPropertyLeases, type PropertyLeases } from '@/server/leases/load';
import { requireMember } from '@/server/member';
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
      const openDueDates = invoices
        .filter((invoice) => invoice.leaseId === live.id && invoice.status === 'issued' && invoice.outstandingVnd > 0)
        .map((invoice) => invoice.dueDate);
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
  const [member, rental, leases, t, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyRental(id),
    loadPropertyLeases(id, asOf),
    getTranslations('propertyRental'),
    getLocale(),
    getMessages(),
  ]);
  const canEdit = member.role !== 'viewer';
  const roomingHouse = property.kind === 'rooming_house';
  const declared = roomingHouse ? (roomCountSchema.safeParse(property.kindDetails).data?.room_count ?? null) : null;
  const rooms = rental.units.filter((unit) => unit.kind === 'room').length;
  const rents = rental.units.flatMap((unit) => (unit.list_rent_vnd === null ? [] : [unit.list_rent_vnd]));
  const total = rents.length === 0 ? null : vnd(rents.reduce((sum, rent) => sum + rent, 0));
  const onlyWhole = rental.units.length === 1 && rental.units[0]?.kind === 'whole';
  const addAccount = canEdit ? { href: `/properties/${id}/rental/accounts/new`, label: t('addAccount') } : null;
  const { money, date, status } = messages.components;

  return (
    <PropertyDetailFrame property={property} tab="rental">
      <PropertyIntl locale={locale} messages={{ propertyRental: messages.propertyRental, components: { money, date, status } }}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <section aria-labelledby="rental-units" data-testid="rental-units" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="rental-units" className="text-h3 text-ink">
                {t('unitsTitle')}
              </h2>
              {total === null ? null : (
                <p data-testid="rental-total" className="text-small text-ink-muted">
                  {t('totalRent')} <span className="figures text-body font-bold text-ink">{formatVnd(total, locale)}</span>
                </p>
              )}
            </div>
            {declared === null || declared === rooms ? null : (
              <p data-testid="room-count-mismatch" className="text-body text-ink-2">
                {t('roomCountMismatch', { declared, actual: rooms })}
              </p>
            )}
            {onlyWhole && canEdit ? <p className="max-w-prose text-body text-ink-2">{t('wholeHint')}</p> : null}
            <UnitList propertyId={id} units={rental.units} leases={unitLeases(rental.units, leases, asOf)} canEdit={canEdit} roomingHouse={roomingHouse} />
          </section>
          <section aria-labelledby="rental-accounts" data-testid="rental-accounts" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <h2 id="rental-accounts" className="text-h3 text-ink">
                {t('accountsTitle')}
              </h2>
              {addAccount === null || rental.accounts.length === 0 ? null : (
                <Link href={addAccount.href} data-testid="add-account" className={buttonVariants({ variant: 'outline' })}>
                  <Plus aria-hidden="true" />
                  {addAccount.label}
                </Link>
              )}
            </div>
            {rental.accounts.length === 0 ? (
              <EmptyState title={t('accountsEmpty')} body={t('accountsEmptyBody')} icon={Plug} {...(addAccount === null ? {} : { action: addAccount })} />
            ) : (
              <UtilityAccountList propertyId={id} accounts={rental.accounts} units={rental.units} canEdit={canEdit} />
            )}
          </section>
        </div>
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
