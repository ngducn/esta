import { addDays, addMonths } from '@esta/core/date/calendar';
import { amendmentStarts, contractTenant, currentMonthlyRent, holdsUnit, leaseDefaults, leaseFieldsFromExtraction, renewalStart } from '@esta/core/lease';
import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LeaseForm, type ContractPrefill, type LeaseFormUnit } from '@/components/leases/LeaseForm';
import { newLeaseValues, valuesFromRow, withContract } from '@/components/leases/lease-form-values';
import { LeaseActions, type RenewalOffer } from '@/components/leases/LeaseActions';
import { LeaseDeposit } from '@/components/leases/LeaseDeposit';
import { LeaseDocuments } from '@/components/leases/LeaseDocuments';
import { LeaseTerms } from '@/components/leases/LeaseTerms';
import { PeriodTimeline } from '@/components/leases/PeriodTimeline';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { StatusMark, StatusShape } from '@/components/status-mark';
import { getClock } from '@/server/clock';
import { loadContractReading, loadLeaseDocuments } from '@/server/leases/detail';
import { loadPropertyLeases, loadTenants, type InvoiceSummary, type LeaseWithTenant, type PropertyLeases } from '@/server/leases/load';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { loadPropertyRental } from '@/server/properties/rental';

const paramsSchema = z.object({ id: z.uuid(), leaseId: z.union([z.literal('new'), z.uuid()]) });
const searchSchema = z.object({
  unit: z.uuid().optional().catch(undefined),
  activate: z.literal('1').optional().catch(undefined),
  renew: z.literal('1').optional().catch(undefined),
  fromDocument: z.uuid().optional().catch(undefined),
});

type Params = Promise<{ id: string; leaseId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const t = await getTranslations('leases');
  return parsed.success && parsed.data.leaseId === 'new' ? { title: t('metaNew') } : {};
}

/** Rent periods from today's amendable starts, at most this many. */
const AMEND_STARTS_SHOWN = 12;

function latestIssuedEnd(invoices: readonly InvoiceSummary[]) {
  return invoices.filter((invoice) => invoice.status === 'issued').reduce<InvoiceSummary['periodEnd'] | null>((latest, invoice) => (latest === null || invoice.periodEnd > latest ? invoice.periodEnd : latest), null);
}

/** Which lease this one renewed and which renewed it; a draft renewal does not count until it is active. */
function renewalLinks(lease: LeaseWithTenant, all: PropertyLeases['leases'], leasesHref: string) {
  const previous = lease.renewal_of_lease_id === null ? undefined : all.find((candidate) => candidate.id === lease.renewal_of_lease_id);
  const next = all.find((candidate) => candidate.renewal_of_lease_id === lease.id && candidate.status !== 'draft');
  const link = (target: LeaseWithTenant | undefined) => (target === undefined ? null : { href: `${leasesHref}/${target.id}`, startDate: target.start_date });
  return { renewalOf: link(previous), renewedBy: link(next) };
}

/** A new lease or a draft opens the form; any other lease, or a viewer's visit, shows lease detail (P3-08). */
export default async function LeasePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id, leaseId } = parsed.data;
  const search = searchSchema.parse(await searchParams);
  const asOf = (await getClock()).today();
  const [member, property, rental, leases, t, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyDetail(id),
    loadPropertyRental(id),
    loadPropertyLeases(id, asOf),
    getTranslations('leases'),
    getLocale(),
    getMessages(),
  ]);
  if (property === null) notFound();
  const canEdit = member.role !== 'viewer';
  const lease = leaseId === 'new' ? null : (leases.leases.find((candidate) => candidate.id === leaseId) ?? null);
  if ((leaseId === 'new' && !canEdit) || (leaseId !== 'new' && lease === null)) notFound();

  const contract = lease === null && search.fromDocument !== undefined ? await loadContractReading(id, search.fromDocument) : null;
  const read = contract === null ? null : leaseFieldsFromExtraction(contract, rental.units);
  const unitFor = (unitId: string | undefined) => rental.units.find((unit) => unit.id === unitId);
  const leased = new Set(leases.leases.filter((candidate) => holdsUnit(candidate, asOf)).map((candidate) => candidate.unit_id));
  const unit = unitFor(lease?.unit_id ?? read?.terms.unit_id ?? search.unit) ?? rental.units.find((candidate) => !leased.has(candidate.id)) ?? rental.units[0];
  if (unit === undefined) notFound();
  const backHref = `/properties/${id}/rental`;
  const summary = lease !== null && !(lease.status === 'draft' && canEdit) ? lease : null;
  // A lease on the whole property is named after the property, so its title and confirm never read "Toàn bộ".
  const name = unit.kind === 'whole' ? property.nickname : unit.label;
  const title = lease === null ? t('newTitle', { unit: name }) : lease.status === 'draft' ? t('draftTitle', { unit: name }) : t('leaseTitle', { unit: name });
  const formUnits: LeaseFormUnit[] = rental.units.map((candidate) => ({ id: candidate.id, label: candidate.label, defaults: leaseDefaults(candidate, property.kind) }));
  const tenants = summary === null ? await loadTenants() : [];
  const { money, date, status, toast } = messages.components;

  if (summary === null) {
    const blank = lease === null ? newLeaseValues(unit.id, leaseDefaults(unit, property.kind)) : valuesFromRow(lease);
    const filled = read === null ? null : withContract(blank, read.terms, contractTenant(tenants, read.tenant)?.id ?? null);
    const fromContract: ContractPrefill | null =
      filled === null || read === null || search.fromDocument === undefined ? null : { documentId: search.fromDocument, prefilled: filled.prefilled, tenant: read.tenant };
    return (
      <div className="flex flex-col gap-5">
        <BackLink href={backHref} label={property.nickname} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-h2 break-words text-balance lg:text-h1">{title}</h1>
          {lease === null ? null : <StatusMark status="draft" />}
        </div>
        <PropertyIntl locale={locale} messages={{ leases: messages.leases, components: { money, date, status } }}>
          <LeaseForm
            propertyId={id}
            leaseId={lease?.id ?? null}
            initial={filled?.values ?? blank}
            units={formUnits}
            tenants={tenants}
            activateOnOpen={search.activate === '1'}
            contract={fromContract}
          />
        </PropertyIntl>
      </div>
    );
  }

  const leasesHref = `${backHref}/leases`;
  const documents = await loadLeaseDocuments(summary.id);
  const schedule = leases.schedule.filter((period) => period.leaseId === summary.id);
  const amendments = leases.amendments.filter((amendment) => amendment.leaseId === summary.id);
  const invoices = leases.invoices.filter((invoice) => invoice.leaseId === summary.id);
  const { renewalOf, renewedBy } = renewalLinks(summary, leases.leases, leasesHref);
  const active = canEdit && summary.status === 'active';
  const start = renewalStart(summary.end_date);
  const lastRentVnd = summary.end_date === null ? null : (currentMonthlyRent(schedule, summary.end_date) ?? summary.rent_vnd);
  const renewal: RenewalOffer | null =
    canEdit && start !== null && lastRentVnd !== null && renewedBy === null && (summary.status === 'active' || summary.status === 'ended')
      ? { start, startsBeforeToday: start < asOf, lastRentVnd, defaultEnd: addDays(addMonths(start, 12), -1) }
      : null;
  const amendStarts = active
    ? amendmentStarts(schedule, amendments, { asOf, billedThrough: latestIssuedEnd(invoices), paidThrough: summary.paid_through_date }).slice(0, AMEND_STARTS_SHOWN)
    : [];
  const ended = summary.status === 'ended' || summary.status === 'terminated';

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={backHref} label={property.nickname} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-h2 break-words text-balance lg:text-h1">{title}</h1>
          <span
            data-testid="lease-status"
            data-status={summary.status}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface-2 px-3 py-1 text-small font-medium text-ink-2"
          >
            {ended ? <StatusShape status="ended" className="size-4" /> : null}
            <span>{t('status', { status: summary.status })}</span>
          </span>
        </div>
        <PropertyIntl locale={locale} messages={{ leases: messages.leases, components: { money, date, status, toast } }}>
          <LeaseActions
            leaseId={summary.id}
            unitLabel={name}
            leasesHref={leasesHref}
            active={active}
            amendStarts={amendStarts}
            renewal={renewal}
            renewOnOpen={search.renew === '1'}
            issuedBills={invoices.filter((invoice) => invoice.status === 'issued').map(({ id, number, periodStart }) => ({ id, number, periodStart }))}
          />
        </PropertyIntl>
      </div>
      {canEdit ? null : <p className="text-body text-ink-2">{t('viewerNote')}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <LeaseTerms lease={summary} unitLabel={unit.label} invoices={invoices} schedule={schedule} amendments={amendments} asOf={asOf} renewalOf={renewalOf} renewedBy={renewedBy} />
          <PropertyIntl locale={locale} messages={{ deposits: messages.deposits, components: { money, date, status, toast } }}>
            <LeaseDeposit lease={summary} unitLabel={name} invoices={invoices} canEdit={canEdit} today={asOf} />
          </PropertyIntl>
          <PropertyIntl locale={locale} messages={{ leases: messages.leases, documents: messages.documents, components: { money, date, status, toast } }}>
            <LeaseDocuments leaseId={summary.id} propertyId={id} nickname={property.nickname} documents={documents} canEdit={canEdit} />
          </PropertyIntl>
        </div>
        <div className="order-first lg:order-none">
          {summary.start_date === null || summary.rent_vnd === null ? null : <PeriodTimeline schedule={schedule} endDate={summary.end_date} amendments={amendments} invoices={invoices} asOf={asOf} />}
        </div>
      </div>
    </div>
  );
}
