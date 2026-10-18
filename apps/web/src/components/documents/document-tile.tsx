'use client';

import { Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { revealThumbnail } from '@/server/documents/actions';
import type { ExtractionStatus } from '@/server/documents/extraction-status';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

/** [app rule] A revealed sensitive thumbnail blurs again after a minute, or as soon as the tab is hidden (DOC-5). */
export const REVEAL_MS = 60_000;

export type DocumentTileData = {
  readonly id: string;
  readonly title: string;
  readonly categoryLabel: string;
  readonly expiry: { readonly text: string; readonly expired: boolean } | null;
  readonly sensitive: boolean;
  /** The blurred thumbnail for a sensitive document, the clear one otherwise. */
  readonly thumbUrl: string | null;
};

type Pill = { readonly mark: MarkStatus; readonly label: 'extractionReading' | 'extractionOffline' | 'extractionWaiting' | 'extractionFailed' };

/** What the assistant is doing with the document. Nothing shows before an extraction or after its review. */
function extractionPill(status: ExtractionStatus, workerOffline: boolean): Pill | null {
  switch (status) {
    case 'queued':
    case 'running':
      return workerOffline ? { mark: 'ended', label: 'extractionOffline' } : { mark: 'draft', label: 'extractionReading' };
    case 'needs_review':
      return { mark: 'due', label: 'extractionWaiting' };
    case 'failed':
      return { mark: 'overdue', label: 'extractionFailed' };
    default:
      return null;
  }
}

/** DESIGN-BRIEF §7: thumbnail, category, title and the expiry line. A sensitive tile reveals only on `Xem`. */
export function DocumentTile({
  document,
  extraction = 'none',
  workerOffline = false,
}: {
  document: DocumentTileData;
  extraction?: ExtractionStatus;
  workerOffline?: boolean;
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
  const pill = extractionPill(extraction, workerOffline);
  const src = clearUrl ?? document.thumbUrl;
  return (
    <li data-testid="document-tile" data-blurred={blurred} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
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
        <p role="status" data-testid="extraction-status" data-status={extraction} className="flex min-h-0 empty:hidden">
          {pill === null ? null : (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks[pill.mark].pill)}>
              <StatusShape status={pill.mark} className="size-4" />
              <span>{t(pill.label)}</span>
            </span>
          )}
        </p>
        <a
          href={`/api/documents/${document.id}/view`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('open', { title: document.title })}
          className="text-body font-bold break-words text-ink underline-offset-4 hover:underline"
        >
          {document.title}
        </a>
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
