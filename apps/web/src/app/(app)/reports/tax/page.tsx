import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChoiceLinks } from '@/components/choice-links';
import { PropertyIntl } from '@/components/properties/property-intl';
import { OtherRevenueForm } from '@/components/tax/other-revenue-form';
import { TaxLeasesCard, TaxNotesCard, TaxPositionCard } from '@/components/tax/tax-card';
import { getClock } from '@/server/clock';
import { queryParam } from '@/server/documents/vault';
import { requireMember } from '@/server/member';
import { taxIslandIntl } from '@/server/properties/island-messages';
import { loadTaxCard, loadTaxOwners, loadTaxYears } from '@/server/tax/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('taxCard');
  return { title: t('title') };
}

const href = (partyId: string, year: number) => `/reports/tax?owner=${partyId}&year=${year}`;

export default async function TaxCardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, member, clock, t, notes] = await Promise.all([searchParams, requireMember(), getClock(), getTranslations('taxCard'), getTranslations('taxNotes')]);
  const asOf = clock.today();
  const [owners, years] = await Promise.all([loadTaxOwners(member.household.id, member.id), loadTaxYears(member.household.id, asOf)]);
  const owner = owners.find((candidate) => candidate.id === queryParam(query.owner)) ?? owners[0];
  const requested = Number(queryParam(query.year));
  const year = years.includes(requested) ? requested : Number(asOf.slice(0, 4));
  const card = owner === undefined ? null : await loadTaxCard(member.household.id, { partyId: owner.id, year, asOf });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h2 break-words lg:text-h1">{t('title')}</h1>
      {owner === undefined ? null : (
        <div className="flex flex-col gap-3">
          <ChoiceLinks label={t('owners')} testId="tax-owners" choices={owners.map((candidate) => ({ key: candidate.id, label: candidate.name, href: href(candidate.id, year), current: candidate.id === owner.id }))} />
          <ChoiceLinks label={t('years')} testId="tax-years" choices={years.map((option) => ({ key: String(option), label: String(option), href: href(owner.id, option), current: option === year }))} />
        </div>
      )}
      {card?.kind === 'no_rule' ? (
        <p data-testid="tax-no-rule" className="rounded-lg border border-rule bg-surface p-5 text-body font-semibold text-ink shadow-card sm:p-6">
          {notes('noRule', { year })}
        </p>
      ) : null}
      {owner !== undefined && card?.kind === 'position' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <TaxPositionCard position={card.position} rule={card.rule} otherBusinessRevenueVnd={card.otherBusinessRevenueVnd} year={year} asOf={asOf} />
            <TaxLeasesCard declared={card.declared} withheld={card.withheld} position={card.position} rule={card.rule} owner={owner.name} year={year} />
          </div>
          <div className="flex flex-col gap-5">
            <PropertyIntl {...await taxIslandIntl()}>
              <OtherRevenueForm key={`${owner.id}:${year}`} partyId={owner.id} year={year} savedVnd={card.otherBusinessRevenueVnd} canEdit={member.role !== 'viewer'} />
            </PropertyIntl>
            <TaxNotesCard position={card.position} rule={card.rule} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
