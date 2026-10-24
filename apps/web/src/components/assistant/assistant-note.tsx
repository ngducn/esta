import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { cn } from '@/lib/utils';
import type { InboxNote } from '@/server/agent/items';

/**
 * One note from Trợ lý on its own card: who wrote it and when, the title, the body as safe Markdown, and the actions
 * the screen passes. Unread is a dot, the word `Mới` and a heavier title, never color alone.
 */
export async function AssistantNote({ note, time, actions }: { note: InboxNote; time: string; actions?: ReactNode }) {
  const [t, review] = await Promise.all([getTranslations('assistant'), getTranslations('extraction')]);
  const unread = note.status === 'new';
  return (
    <article data-testid="inbox-item" data-status={note.status} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-accent text-small font-semibold text-accent">
          {t('monogram')}
        </span>
        <span className="text-small font-medium text-ink">{t('author')}</span>
        <time dateTime={note.createdAt} className="text-small text-ink-muted figures">
          {time}
        </time>
        {unread ? (
          <span data-testid="note-unread" className="inline-flex items-center gap-1.5 text-small font-medium text-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
            {t('unread')}
          </span>
        ) : null}
        {note.operatorOnly ? (
          <span data-testid="note-operator" className="rounded-full border border-rule bg-surface-2 px-3 py-0.5 text-small font-medium text-ink-2">
            {t('operatorOnly')}
          </span>
        ) : null}
      </header>
      <h3 className={cn('text-lead break-words text-ink', unread ? 'font-semibold' : 'font-medium')}>{note.title}</h3>
      {note.bodyMd === null ? null : <SafeMarkdown className="max-w-prose">{note.bodyMd}</SafeMarkdown>}
      {note.retry === null ? null : <p className="text-body break-words text-ink-2">{t(note.retry === 'self' ? 'retrySelf' : 'retryAsk')}</p>}
      {note.reviewHref === null ? null : (
        <Link href={note.reviewHref} data-testid="item-review" className="w-fit text-body font-medium text-ink underline underline-offset-4 hover:decoration-2">
          {note.retry === null ? review('reviewLink') : review('manualLink')}
        </Link>
      )}
      {actions}
    </article>
  );
}
