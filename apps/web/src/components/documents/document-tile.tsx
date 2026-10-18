'use client';

import { Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { revealThumbnail } from '@/server/documents/actions';
import { Button } from '@/components/ui/button';
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

/** DESIGN-BRIEF §7: thumbnail, category, title and the expiry line. A sensitive tile reveals only on `Xem`. */
export function DocumentTile({ document }: { document: DocumentTileData }) {
  const t = useTranslations('documents');
  const [clearUrl, setClearUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

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
    <li data-testid="document-tile" data-blurred={blurred} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
      <div className="relative aspect-[4/3] bg-surface-2">
        {src === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-muted">
            <FileText className="size-8" aria-hidden="true" />
            <span className="text-small">{t('noPreview')}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
          <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        )}
        {blurred ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ground/40 p-3">
            <span className="rounded-sm bg-surface px-2 py-0.5 text-small font-semibold text-ink-2">{t('blurred')}</span>
            <Button type="button" variant="secondary" data-testid="reveal-thumbnail" disabled={pending} aria-label={t('viewLabel', { title: document.title })} onClick={reveal}>
              <Eye aria-hidden="true" />
              {t('view')}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-4">
        <p className="text-small font-semibold text-ink-muted">{document.categoryLabel}</p>
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
