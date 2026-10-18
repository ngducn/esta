import { leaseDefaults } from '@esta/core/lease';
import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LeaseForm, type LeaseFormUnit } from '@/components/leases/LeaseForm';
import { newLeaseValues, valuesFromRow } from '@/components/leases/lease-form-values';
import { LeaseSummary } from '@/components/leases/lease-summary';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { StatusMark } from '@/components/status-mark';
import { getClock } from '@/server/clock';
import { loadPropertyLeases, loadTenants } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { loadPropertyRental } from '@/server/properties/rental';

const paramsSchema = z.object({ id: z.uuid(), leaseId: z.union([z.literal('new'), z.uuid()]) });
const searchSchema = z.object({ unit: z.uuid().optional().catch(undefined), activate: z.literal('1').optional().catch(undefined) });

type Params = Promise<{ id: string; leaseId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const t = await getTranslations('leases');
  return parsed.success && parsed.data.leaseId === 'new' ? { title: t('metaNew') } : {};
}

/** A new lease or a draft opens the form; any other lease, or a viewer's visit, shows its terms and invoices. */
export default async function LeasePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id, leaseId } = parsed.data;
  const search = searchSchema.parse(await searchParams);
  const [member, property, rental, leases, clock, t, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyDetail(id),
    loadPropertyRental(id),
    loadPropertyLeases(id),
    getClock(),
    getTranslations('leases'),
    getLocale(),
    getMessages(),
  ]);
  if (property === null) notFound();
  const canEdit = member.role !== 'viewer';
  const lease = leaseId === 'new' ? null : (leases.leases.find((candidate) => candidate.id === leaseId) ?? null);
  if ((leaseId === 'new' && !canEdit) || (leaseId !== 'new' && lease === null)) notFound();

  const unitFor = (unitId: string | undefined) => rental.units.find((unit) => unit.id === unitId);
  const leased = new Set(leases.leases.filter((candidate) => candidate.status === 'active').map((candidate) => candidate.unit_id));
  const unit = unitFor(lease?.unit_id ?? search.unit) ?? rental.units.find((candidate) => !leased.has(candidate.id)) ?? rental.units[0];
  if (unit === undefined) notFound();
  const backHref = `/properties/${id}/rental`;
  const summary = lease !== null && !(lease.status === 'draft' && canEdit) ? lease : null;
  const title = lease === null ? t('newTitle', { unit: unit.label }) : lease.status === 'draft' ? t('draftTitle', { unit: unit.label }) : t('leaseTitle', { unit: unit.label });
  const formUnits: LeaseFormUnit[] = rental.units.map((candidate) => ({ id: candidate.id, label: candidate.label, defaults: leaseDefaults(candidate, property.kind) }));
  const tenants = summary === null ? await loadTenants() : [];
  const { money, date, status } = messages.components;

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={backHref} label={property.nickname} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-h2 break-words text-balance lg:text-h1">{title}</h1>
        {lease === null ? null : lease.status === 'draft' ? (
          <StatusMark status="draft" />
        ) : (
          <span data-testid="lease-status" className="text-body font-semibold text-ink-2">
            {t('status', { status: lease.status })}
          </span>
        )}
      </div>
      {summary === null ? (
        <PropertyIntl locale={locale} messages={{ leases: messages.leases, components: { money, date, status } }}>
          <LeaseForm
            propertyId={id}
            leaseId={lease?.id ?? null}
            initial={lease === null ? newLeaseValues(unit.id, leaseDefaults(unit, property.kind)) : valuesFromRow(lease)}
            units={formUnits}
            tenants={tenants}
            activateOnOpen={search.activate === '1'}
          />
        </PropertyIntl>
      ) : (
        <>
          {canEdit ? null : <p className="text-body text-ink-2">{t('viewerNote')}</p>}
          <LeaseSummary lease={summary} unitLabel={unit.label} invoices={leases.invoices.filter((invoice) => invoice.leaseId === summary.id)} asOf={clock.today()} />
        </>
      )}
    </div>
  );
}
