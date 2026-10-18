import { documentExpiry } from '@esta/core/documents';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DocumentGrid } from '@/components/documents/document-grid';
import type { DocumentTileData } from '@/components/documents/document-tile';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UndoToastProvider } from '@/components/undo-toast';
import { getClock } from '@/server/clock';
import { listDocuments } from '@/server/documents/list';
import { readDocumentStatuses } from '@/server/documents/status';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

export default async function PropertyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const member = await requireMember();
  const [rows, statuses, clock, t, locale, messages] = await Promise.all([
    listDocuments(member.household.id, id),
    readDocumentStatuses(id),
    getClock(),
    getTranslations('documents'),
    getLocale(),
    getMessages(),
  ]);
  const today = clock.today();
  const documents: DocumentTileData[] = rows.map((row) => {
    const expiry = documentExpiry(row.expiresOn, today);
    return {
      id: row.id,
      title: row.title,
      categoryLabel: t('category', { category: row.category }),
      sensitive: row.sensitive,
      thumbUrl: row.thumbUrl,
      expiry:
        expiry.state === 'none'
          ? null
          : expiry.state === 'expired'
            ? { text: t('expired'), expired: true }
            : { text: t('expiry', { days: expiry.days }), expired: false },
    };
  });
  const { date, toast } = messages.components;

  return (
    <PropertyDetailFrame property={property} tab="documents">
      <PropertyIntl locale={locale} messages={{ documents: messages.documents, components: { date, toast } }}>
        <UndoToastProvider>
          <DocumentGrid
            propertyId={id}
            nickname={property.nickname}
            documents={documents}
            canEdit={member.role !== 'viewer'}
            statuses={statuses ?? { statuses: {}, workerOffline: false }}
          />
        </UndoToastProvider>
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
