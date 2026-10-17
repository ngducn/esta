import { currentAddressText } from '@esta/core/properties';
import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PropertyHeader } from '@/components/properties/property-header';
import { PropertyTabBar } from '@/components/properties/property-tab-bar';
import type { PropertyTabId } from '@/components/properties/property-tabs';
import { IntentLink } from '@/components/shell/intent-link';
import type { PropertyDetail } from '@/server/properties/detail';
import { requireMember } from '@/server/member';
import { signCoverPhotos } from '@/server/properties/photos';

/**
 * Each tab renders the header rather than the layout, because Next scrolls a navigation to the first element of the
 * new page: from a scrolled list, or at 130% text, that element must be the photo, not the tab content below it.
 */
export async function PropertyDetailFrame({ property, tab, children }: { property: PropertyDetail; tab: PropertyTabId; children: ReactNode }) {
  const member = await requireMember();
  const [t, tp, photos] = await Promise.all([
    getTranslations('propertyDetail'),
    getTranslations('properties'),
    signCoverPhotos(member.id, property.coverPhotoPath === null ? [] : [property.coverPhotoPath]),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <IntentLink href="/properties" className="-ml-2 flex min-h-touch w-fit items-center gap-1 rounded-sm px-2 text-body font-semibold text-ink-2 hover:text-ink">
        <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {t('back')}
      </IntentLink>
      <PropertyHeader
        property={{
          nickname: property.nickname,
          kind: property.kind,
          kindLabel: tp('kind', { kind: property.kind }),
          useMode: property.useMode,
          useLabel: tp('use', { use: property.useMode }),
          legalStatus: property.legalStatus,
          legalLabel: tp('legal', { legal: property.legalStatus }),
          currentAddress: currentAddressText(property),
          certificateAddress: property.certificateAddressText,
          photoUrl: property.coverPhotoPath === null ? null : (photos.get(property.coverPhotoPath) ?? null),
          edit: member.role === 'viewer' ? null : { href: `/properties/${property.id}/edit`, label: t('edit') },
        }}
      />
      <PropertyTabBar
        propertyId={property.id}
        active={tab}
        label={t('tabs')}
        labels={{ overview: t('tab', { tab: 'overview' }), activity: t('tab', { tab: 'activity' }) }}
      />
      {children}
    </div>
  );
}
