import { formatDayMonth } from '@esta/core/format';
import { nextMissing } from '@esta/core/completeness';
import { currentAddressText } from '@esta/core/properties';
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MissingItems } from '@/components/completeness/missing-items';
import { PropertyHeader } from '@/components/properties/property-header';
import { PropertyTabBar } from '@/components/properties/property-tab-bar';
import type { PropertyTabId } from '@/components/properties/property-tabs';
import { IntentLink } from '@/components/shell/intent-link';
import type { PropertyDetail } from '@/server/properties/detail';
import { requireMember } from '@/server/member';
import { loadCompleteness } from '@/server/properties/completeness';
import { signCoverPhotos } from '@/server/properties/photos';

/**
 * Each tab renders the header rather than the layout, because Next scrolls a navigation to the first element of the
 * new page: from a scrolled list, or at 130% text, that element must be the photo, not the tab content below it.
 */
export async function PropertyDetailFrame({ property, tab, children }: { property: PropertyDetail; tab: PropertyTabId; children: ReactNode }) {
  const member = await requireMember();
  const [t, tp, tc, locale, photos, scores] = await Promise.all([
    getTranslations('propertyDetail'),
    getTranslations('properties'),
    getTranslations('completeness'),
    getLocale(),
    signCoverPhotos(member.id, property.coverPhotoPath === null ? [] : [property.coverPhotoPath]),
    loadCompleteness(member.household.id, property.id),
  ]);
  const score = scores.get(property.id) ?? { percent: 100, failing: [] };
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
          vacant: property.status === null ? null : tp('vacantSince', { date: formatDayMonth(property.status.since, locale) }),
          edit: member.role === 'viewer' ? null : { href: `/properties/${property.id}/edit`, label: t('edit') },
          completeness: {
            title: tc('title'),
            percent: score.percent,
            score: tc('score', { percent: score.percent }),
          },
        }}
      />
      <PropertyTabBar
        propertyId={property.id}
        active={tab}
        label={t('tabs')}
        labels={{
          overview: t('tab', { tab: 'overview' }),
          legal: t('tab', { tab: 'legal' }),
          rental: t('tab', { tab: 'rental' }),
          activity: t('tab', { tab: 'activity' }),
        }}
      />
      {tab === 'overview' ? (
        <MissingItems
          data={{
            listLabel: tc('nextTitle'),
            complete: score.failing.length === 0 ? tc('complete') : null,
            items: nextMissing(score, 3).map((item) => ({
              id: item.id,
              label: tc(`checks.${item.id}`),
              href: member.role === 'viewer' ? null : item.href,
            })),
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
