import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DocumentPage } from '@/components/documents/document-page';
import { PropertyIntl } from '@/components/properties/property-intl';
import { loadDocumentPage } from '@/server/documents/detail';

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav('documents') };
}

/** Opening a document signs its file and logs one view (DOC-4). */
export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const [data, locale, messages] = await Promise.all([loadDocumentPage(documentId), getLocale(), getMessages()]);
  if (data === null) notFound();
  const { date, toast } = messages.components;
  return (
    <PropertyIntl locale={locale} messages={{ documents: messages.documents, extraction: messages.extraction, components: { date, toast } }}>
      <DocumentPage data={data} />
    </PropertyIntl>
  );
}
