'use client';

import { Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { revealThumbnail } from '@/server/documents/actions';
import type { ExtractionStatus } from '@/server/documents/extraction-status';
import type { VaultTile } from '@/server/documents/list';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

/** [app rule] A revealed sensitive thumbnail blurs again after a minute, or as soon as the tab is hidden (DOC-5). */
export const REVEAL_MS = 60_000;

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

/**
 * DESIGN-BRIEF §7: thumbnail, category, title and the expiry line, with the property name in the household vault. A
 * sensitive tile reveals only on `Xem`. The title opens the document page.
 */
export function DocumentTile({
  document,
  extraction = 'none',
  workerOffline = false,
  showProperty = false,
}: {
  document: VaultTile;
  extraction?: ExtractionStatus;
  workerOffline?: boolean;
  showProperty?: boolean;
}) {
  const t = useTranslations('documents');
  const [clearUrl, setClearUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  useEffect(() => {
    if (clearUrl === null) return;
    const blur = () => setClearUrl(null);
    const onVisibility = () => (window.document.visibilityState === 'hidden' ? blur() : undefined);
    const timer = window.setTimeout(blur, REVEAL_MS);
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearUrl]);

  const reveal = () =>
    startTransition(async () => {
      const url = await revealThumbnail(document.id).catch(() => null);
      setFailed(url === null);
      setClearUrl(url);
    });

  const blurred = document.sensitive && clearUrl === null;
  const src = clearUrl ?? document.thumbUrl;
  return (
    <li data-testid="document-tile" data-document-id={document.id} data-blurred={blurred} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
      <div className="relative aspect-[4/3] bg-surface-2">
        {src === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-muted">
            <FileText className="size-8" aria-hidden="true" />
            <span className="text-small">{t('noPreview')}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
          <img src={src} alt="" className="absolute inset-0 size-full object-cover object-top" loading="lazy" decoding="async" />
        )}
        {blurred ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ground/40 p-3">
            <span className="rounded-sm bg-surface px-2 py-0.5 text-small font-semibold text-ink-2">{t('blurred')}</span>
            <Button type="button" variant="secondary" data-testid="reveal-thumbnail" disabled={pending || !hydrated} aria-label={t('viewLabel', { title: document.title })} onClick={reveal}>
              <Eye aria-hidden="true" />
              {t('view')}
            </Button>
          </div>
        ) : null}
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
        {failed ? (
          <p role="alert" className="text-small text-overdue">
            {t('viewFailed')}
          </p>
        ) : null}
      </div>
    </li>
  );
}
