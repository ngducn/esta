import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReviewPanel } from '@/components/extraction/review-panel';
import { PropertyIntl } from '@/components/properties/property-intl';
import { loadReview, reviewPanelState } from '@/server/extraction/review';
import { loadLandUseCodes } from '@/server/properties/legal';

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav('documents') };
}

/** DOC-6: the document beside the fields the assistant read, each to accept or fix; a failed read is entered by hand. */
export default async function DocumentReviewPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const review = await loadReview(documentId);
  if (review === null) notFound();
  const { document, extraction } = review;
  const [t, locale, messages, landUseCodes, { status, mode, fields }] = await Promise.all([
    getTranslations('extraction'),
    getLocale(),
    getMessages(),
    loadLandUseCodes(),
    reviewPanelState(extraction),
  ]);
  const { purposeCodeHint, unknownCode } = messages.propertyLegal;
  const { date, money, confirm } = messages.components;
  const back = document.propertyId === null ? '/documents' : `/properties/${document.propertyId}/documents`;

  return (
    <div className="flex flex-col gap-5">
      <Link href={back} className="-ml-2 flex min-h-touch w-fit items-center gap-1 rounded-sm px-2 text-body font-medium text-ink-2 hover:text-ink">
        <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {t('back')}
      </Link>
      <h1 className="text-h2 break-words lg:text-h1">{t('pageTitle', { title: document.title })}</h1>
      <PropertyIntl locale={locale} messages={{ extraction: messages.extraction, propertyLegal: { purposeCodeHint, unknownCode }, components: { date, money, confirm } }}>
        <ReviewPanel
          documentId={document.id}
          title={document.title}
          mime={document.mime}
          pageCount={document.pageCount}
          fileUrl={review.fileUrl}
          reviewUrl={review.reviewUrl}
          thumbUrl={review.thumbUrl}
          mode={mode}
          extractionId={extraction?.id ?? null}
          schemaName={extraction?.schemaName ?? 'certificate_v1'}
          fields={fields}
          statuses={review.statuses}
          renderedStatus={status}
          canEdit={review.canEdit}
          landUseCodes={landUseCodes}
          propertyId={document.propertyId}
          leaseId={document.leaseId}
          properties={review.properties}
          certificateAddresses={review.certificateAddresses}
        />
      </PropertyIntl>
    </div>
  );
}
