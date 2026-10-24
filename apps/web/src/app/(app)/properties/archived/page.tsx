import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RestoreButton } from '@/components/properties/archive-button';
import { BackLink } from '@/components/properties/back-link';
import { kindIcons } from '@/components/properties/kind-icons';
import { PropertyIntl } from '@/components/properties/property-intl';
import { requireMember } from '@/server/member';
import { loadArchivedProperties } from '@/server/properties/form';
import { propertyIslandIntl } from '@/server/properties/island-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('properties');
  return { title: t('archivedTitle') };
}

export default async function ArchivedPropertiesPage() {
  const member = await requireMember();
  const [archived, intl, t, nav] = await Promise.all([
    loadArchivedProperties(member.household.id),
    propertyIslandIntl(),
    getTranslations('properties'),
    getTranslations('nav'),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/properties" label={nav('properties')} />
      <h1 className="text-h2 break-words lg:text-h1">{t('archivedTitle')}</h1>
      {archived.length === 0 ? (
        <p className="rounded-lg border border-rule bg-surface p-5 text-body text-ink-2 shadow-card">{t('archivedEmpty')}</p>
      ) : (
        <PropertyIntl locale={intl.locale} messages={intl.messages}>
          <ul data-testid="archived-list" className="flex max-w-3xl flex-col divide-y divide-rule rounded-lg border border-rule bg-surface shadow-card">
            {archived.map((property) => {
              const Icon = kindIcons[property.kind];
              return (
                <li key={property.id} data-testid="archived-row" className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-muted">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-medium text-ink wrap-anywhere">{property.nickname}</span>
                    <span className="text-small text-ink-muted">{t('kind', { kind: property.kind })}</span>
                  </span>
                  {member.role === 'viewer' ? null : <RestoreButton propertyId={property.id} label={t('restore')} />}
                </li>
              );
            })}
          </ul>
        </PropertyIntl>
      )}
    </div>
  );
}
