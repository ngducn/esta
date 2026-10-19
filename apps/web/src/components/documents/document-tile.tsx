'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ExtractionStatus } from '@/server/documents/extraction-status';
import type { VaultTile } from '@/server/documents/list';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { cn } from '@/lib/utils';
import type { CoverPhotoPriority } from '@/components/properties/cover-photo';

type Pill = {
  readonly mark: MarkStatus;
  readonly label: 'extractionReading' | 'extractionOffline' | 'extractionWaiting' | 'extractionFailed' | 'extractionAccepted';
  /** Opens the review: a waiting read to check, or a failed one to enter by hand. */
  readonly reviewable: boolean;
};

/**
 * What the assistant is doing with the document. Nothing shows before an extraction; a tile also stays quiet after
 * its review, while the document page says it was reviewed and links back to it.
 */
function extractionPill(status: ExtractionStatus, workerOffline: boolean, showAccepted: boolean): Pill | null {
  switch (status) {
    case 'queued':
    case 'running':
      return workerOffline ? { mark: 'ended', label: 'extractionOffline', reviewable: false } : { mark: 'draft', label: 'extractionReading', reviewable: false };
    case 'needs_review':
      return { mark: 'due', label: 'extractionWaiting', reviewable: true };
    case 'failed':
      return { mark: 'overdue', label: 'extractionFailed', reviewable: true };
    case 'accepted':
      return showAccepted ? { mark: 'paid', label: 'extractionAccepted', reviewable: true } : null;
    default:
      return null;
  }
}

export function ExtractionPill({
  documentId,
  status,
  workerOffline,
  showAccepted = false,
}: {
  documentId: string;
  status: ExtractionStatus;
  workerOffline: boolean;
  showAccepted?: boolean;
}) {
  const t = useTranslations('documents');
  const pill = extractionPill(status, workerOffline, showAccepted);
  return (
    <p role="status" data-testid="extraction-status" data-status={status} className="flex min-h-0 empty:hidden">
      {pill === null ? null : pill.reviewable ? (
        <Link
          href={`/documents/${documentId}/review`}
          data-testid="review-link"
          className={cn('inline-flex min-h-touch items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold underline-offset-4 hover:underline', statusMarks[pill.mark].pill)}
        >
          <StatusShape status={pill.mark} className="size-4" />
          <span>{t(pill.label)}</span>
        </Link>
      ) : (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks[pill.mark].pill)}>
          <StatusShape status={pill.mark} className="size-4" />
          <span>{t(pill.label)}</span>
        </span>
      )}
    </p>
  );
}

/** The first row of the first group lands on screen, so its thumbnails load at once and the first one first (LCP). */
export function tilePriority(index: number): CoverPhotoPriority {
  if (index === 0) return 'high';
  return index < 3 ? 'eager' : 'lazy';
}

/**
 * DESIGN-BRIEF §7: thumbnail, category, title and the expiry line, with the property name in the household vault. Every
 * thumbnail shows clear, a sensitive document's too (DOC-5). The title opens the document page.
 */
export function DocumentTile({
  document,
  extraction = 'none',
  workerOffline = false,
  showProperty = false,
  priority = 'lazy',
}: {
  document: VaultTile;
  extraction?: ExtractionStatus;
  workerOffline?: boolean;
  showProperty?: boolean;
  priority?: CoverPhotoPriority;
}) {
  const t = useTranslations('documents');
  return (
    <li data-testid="document-tile" data-document-id={document.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
      <div className="relative aspect-[4/3] bg-surface-2">
        {document.thumbUrl === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-muted">
            <FileText className="size-8" aria-hidden="true" />
            <span className="text-small">{t('noPreview')}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
          <img
            src={document.thumbUrl}
            alt=""
            className="absolute inset-0 size-full object-cover object-top"
            loading={priority === 'lazy' ? 'lazy' : 'eager'}
            fetchPriority={priority === 'high' ? 'high' : 'auto'}
            decoding="async"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-4">
        <p className="text-small font-semibold text-ink-muted">{document.categoryLabel}</p>
        <ExtractionPill documentId={document.id} status={extraction} workerOffline={workerOffline} />
        <Link
          href={`/documents/${document.id}`}
          prefetch={false}
          data-testid="document-link"
          className="text-body font-bold break-words text-ink underline-offset-4 hover:underline"
        >
          {document.title}
        </Link>
        {showProperty ? (
          <p data-testid="document-property-name" className="text-small break-words text-ink-2">
            {document.propertyName ?? t('noProperty')}
          </p>
        ) : null}
        {document.expiry === null ? null : (
          <p data-testid="document-expiry" className={cn('text-small font-semibold', document.expiry.expired ? 'text-overdue' : 'text-due')}>
            {document.expiry.text}
          </p>
        )}
      </div>
    </li>
  );
}
