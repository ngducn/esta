'use client';

import { CircleAlert, CircleCheck, CloudOff, FileSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useDocumentStatuses } from '@/components/documents/use-document-status';
import { cn } from '@/lib/utils';
import type { DocumentStatuses } from '@/server/documents/extraction-status';

/**
 * Rides above every step after the photo, so the user never waits on the read: it says the assistant is reading, then
 * links to the review the moment the poll sees `needs_review`, or names the last heartbeat when the worker is stale.
 */
export function ReviewReadyNotice({ documentId, statuses, reviewHref }: { documentId: string; statuses: DocumentStatuses; reviewHref: string }) {
  const t = useTranslations('propertyWizard');
  const polled = useDocumentStatuses(documentId, statuses, { by: 'document' });
  const status = polled.statuses[documentId] ?? 'none';
  const reading = status === 'queued' || status === 'running';

  if (reading && polled.workerOffline && polled.offlineSince != null) {
    return (
      <Notice tone="due" icon={<CloudOff className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />} state="offline">
        {t('offline', { time: polled.offlineSince })}
      </Notice>
    );
  }
  if (reading) {
    return (
      <Notice tone="quiet" icon={<FileSearch className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />} state="reading">
        {t('reading')}
      </Notice>
    );
  }
  if (status === 'needs_review' || status === 'failed') {
    const ready = status === 'needs_review';
    return (
      <Notice tone="accent" icon={<ReadyIcon ready={ready} />} state={ready ? 'ready' : 'failed'}>
        {ready ? t('ready') : t('readFailed')}{' '}
        <Link href={reviewHref} data-testid="review-ready-link" className="font-medium text-accent underline underline-offset-4 hover:text-ink">
          {ready ? t('readyLink') : t('readFailedLink')}
        </Link>
      </Notice>
    );
  }
  if (status === 'accepted') {
    return (
      <Notice tone="quiet" icon={<CircleCheck className="mt-0.5 size-5 shrink-0 text-paid" strokeWidth={2} aria-hidden="true" />} state="accepted">
        {t('accepted')}
      </Notice>
    );
  }
  return null;
}

function ReadyIcon({ ready }: { ready: boolean }) {
  const Icon = ready ? CircleCheck : CircleAlert;
  return <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />;
}

function Notice({ tone, icon, state, children }: { tone: 'quiet' | 'due' | 'accent'; icon: ReactNode; state: string; children: ReactNode }) {
  return (
    <p
      role="status"
      data-testid="review-ready-notice"
      data-state={state}
      className={cn(
        'flex max-w-3xl items-start gap-3 rounded-md px-4 py-3 text-body',
        tone === 'quiet' && 'bg-surface-2 text-ink-2',
        tone === 'due' && 'bg-due-fill font-medium text-due',
        tone === 'accent' && 'border border-accent bg-accent-tint text-ink',
      )}
    >
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
