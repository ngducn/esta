import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ArchiveButton } from '@/components/properties/archive-button';
import { BackLink } from '@/components/properties/back-link';
import { CoverPhotoInput } from '@/components/properties/cover-photo-input';
import { PropertyForm } from '@/components/properties/property-form';
import { PropertyIntl } from '@/components/properties/property-intl';
import { listCommunes, listProvinces } from '@/server/address/suggest';
import { requireMember } from '@/server/member';
import { loadEditableProperty, loadPropertyCodes } from '@/server/properties/form';
import { propertyIslandIntl } from '@/server/properties/island-messages';
import { signCoverPhotos } from '@/server/properties/photos';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [member, t] = await Promise.all([requireMember(), getTranslations('propertyForm')]);
  const property = await loadEditableProperty(member.household.id, id);
  return { title: property === null ? t('newTitle') : t('editTitle', { nickname: property.nickname }) };
}

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  if (member.role === 'viewer') notFound();
  const property = await loadEditableProperty(member.household.id, id);
  if (property === null) notFound();
  const province = property.values.address.provinceCode;
  const [provinces, communes, codes, photos, intl, t] = await Promise.all([
    listProvinces(),
    province === null ? [] : listCommunes(province),
    loadPropertyCodes(member.household.id, property.id),
    signCoverPhotos(member.id, property.coverPhotoPath === null ? [] : [property.coverPhotoPath]),
    propertyIslandIntl(),
    getTranslations('propertyForm'),
  ]);
  const detailHref = `/properties/${property.id}`;
  return (
    <div className="flex flex-col gap-5">
      <BackLink href={detailHref} label={property.nickname} />
      <h1 className="text-h2 break-words text-balance lg:text-h1">{t('editTitle', { nickname: property.nickname })}</h1>
      <PropertyIntl locale={intl.locale} messages={intl.messages}>
        <section
          id="cover-photo"
          aria-labelledby="cover-photo-title"
          className="flex max-w-3xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="cover-photo-title" className="text-lead font-bold text-ink">
              {t('photoGroup')}
            </h2>
            <p className="text-small text-ink-muted">{t('photoHint')}</p>
          </div>
          <CoverPhotoInput
            propertyId={property.id}
            nickname={property.nickname}
            photoUrl={property.coverPhotoPath === null ? null : (photos.get(property.coverPhotoPath) ?? null)}
          />
        </section>
        <PropertyForm
          propertyId={property.id}
          initial={property.values}
          provinces={provinces}
          initialCommunes={communes}
          otherCodes={codes}
          cancelHref={detailHref}
        />
        <section aria-labelledby="archive-title" className="flex max-w-3xl flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
          <h2 id="archive-title" className="text-lead font-bold text-ink">
            {t('archiveTitle')}
          </h2>
          <p className="text-body text-ink-2">{t('archiveHint')}</p>
          <ArchiveButton propertyId={property.id} />
        </section>
      </PropertyIntl>
    </div>
  );
}
