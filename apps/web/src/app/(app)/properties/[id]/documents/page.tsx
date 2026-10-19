import { getLocale, getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DocumentVault } from '@/components/documents/document-vault';
import { PropertyIntl } from '@/components/properties/property-intl';
import { loadVault, queryParam } from '@/server/documents/vault';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

export default async function PropertyDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const member = await requireMember();
  const [vault, locale, messages] = await Promise.all([loadVault(member.household.id, id, queryParam(query.q)), getLocale(), getMessages()]);
  const { date } = messages.components;

  return (
    <PropertyDetailFrame property={property} tab="documents">
      <PropertyIntl locale={locale} messages={{ documents: messages.documents, components: { date } }}>
        <DocumentVault scope={{ kind: 'property', propertyId: id, nickname: property.nickname }} canEdit={member.role !== 'viewer'} {...vault} />
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
