import { currentAddressText } from '@esta/core/properties';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { PropertyHeader } from '@/components/properties/property-header';
import { PropertyTabBar } from '@/components/properties/property-tab-bar';
import { IntentLink } from '@/components/shell/intent-link';
import { SkeletonPropertyHeader } from '@/components/skeleton';
import { loadPropertyDetail } from '@/server/properties/detail';
import { signCoverPhotos } from '@/server/properties/photos';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const [property, t] = await Promise.all([loadPropertyDetail(id), getTranslations('propertyDetail')]);
  return { title: property?.nickname ?? t('notFoundTitle') };
}

/** Another household's id loads no row: the header renders nothing and the tab's `notFound()` shows the not-found page. */
async function DetailHeader({ id }: { id: string }) {
  const property = await loadPropertyDetail(id);
  if (property === null) return null;
  const [t, tp, photos] = await Promise.all([
    getTranslations('propertyDetail'),
    getTranslations('properties'),
    signCoverPhotos(property.coverPhotoPath === null ? [] : [property.coverPhotoPath]),
  ]);
  return (
    <>
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
        }}
      />
      <PropertyTabBar
        propertyId={property.id}
        label={t('tabs')}
        labels={{ overview: t('tab', { tab: 'overview' }), activity: t('tab', { tab: 'activity' }) }}
      />
    </>
  );
}

export default async function PropertyDetailLayout({ children, params }: Params & { children: ReactNode }) {
  const { id } = await params;
  const t = await getTranslations('propertyDetail');
  return (
    <div className="flex flex-col gap-5">
      <IntentLink href="/properties" className="-ml-2 flex min-h-touch w-fit items-center gap-1 rounded-sm px-2 text-body font-semibold text-ink-2 hover:text-ink">
        <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {t('back')}
      </IntentLink>
      <Suspense fallback={<SkeletonPropertyHeader />}>
        <DetailHeader id={id} />
      </Suspense>
      {children}
    </div>
  );
}
