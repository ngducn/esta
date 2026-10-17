import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/properties/back-link';
import { PropertyForm } from '@/components/properties/property-form';
import { EMPTY_PROPERTY } from '@/components/properties/property-form-values';
import { PropertyIntl } from '@/components/properties/property-intl';
import { listProvinces } from '@/server/address/suggest';
import { requireMember } from '@/server/member';
import { loadPropertyCodes } from '@/server/properties/form';
import { propertyIslandIntl } from '@/server/properties/island-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('propertyForm');
  return { title: t('newTitle') };
}

export default async function NewPropertyPage() {
  const member = await requireMember();
  if (member.role === 'viewer') notFound();
  const [provinces, codes, intl, t, nav] = await Promise.all([
    listProvinces(),
    loadPropertyCodes(member.household.id, null),
    propertyIslandIntl(),
    getTranslations('propertyForm'),
    getTranslations('nav'),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/properties" label={nav('properties')} />
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 break-words lg:text-h1">{t('newTitle')}</h1>
        <p className="text-body text-ink-2">{t('photoAfterSave')}</p>
      </header>
      <PropertyIntl locale={intl.locale} messages={intl.messages}>
        <PropertyForm propertyId={null} initial={EMPTY_PROPERTY} provinces={provinces} initialCommunes={[]} otherCodes={codes} cancelHref="/properties" />
      </PropertyIntl>
    </div>
  );
}
