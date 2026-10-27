import { formatDate } from '@esta/core/format';
import { getLocale, getTranslations } from 'next-intl/server';
import { Reply } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import type { InboxNote, NoteDiagnostics, NoteKind } from '@/server/agent/items';
import { CitationChip } from './citation-chip';
import { AssistantMonogram } from './monogram';

const KIND_LABEL = { brief: 'briefLabel', weekly: 'weeklyLabel', proposal: 'proposalLabel', note: null } as const satisfies Record<NoteKind, string | null>;

async function Citations({ citations, locale }: { citations: InboxNote['citations']; locale: Awaited<ReturnType<typeof getLocale>> }) {
  const t = await getTranslations('assistant');
  const dated = (source: InboxNote['citations'][number]) => (source.publishedOn === null ? source.sourceName : t('market.source', { name: source.sourceName, date: formatDate(source.publishedOn, locale) }));
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-3">
      <p className="text-small font-medium text-ink-2">{t('sources')}</p>
      <ul className="flex flex-wrap gap-2">
        {citations.map((source, index) => (
          <li key={source.url} className="max-w-full">
            <CitationChip href={source.url} index={index + 1} label={t('citationLabel', { index: index + 1, source: dated(source) })}>
              {dated(source)}
            </CitationChip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Operator-only: what the worker wrote beside the note, and whether each of its links names a readable record. */
async function Diagnostics({ diagnostics }: { diagnostics: NoteDiagnostics }) {
  const t = await getTranslations('assistant');
  return (
    <dl data-testid="note-diagnostics" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-rule pt-3 text-small text-ink-2">
      <dt className="text-ink-muted">{t('diagnosticsKind')}</dt>
      <dd>{t('diagnosticsKindValue', { kind: diagnostics.kind, severity: diagnostics.severity, audience: diagnostics.audience })}</dd>
      <dt className="text-ink-muted">{t('diagnosticsDedupe')}</dt>
      <dd data-testid="note-dedupe" className="wrap-anywhere">
        {diagnostics.dedupeKey}
      </dd>
      {diagnostics.links.length === 0 ? null : (
        <>
          <dt className="text-ink-muted">{t('diagnosticsLinks')}</dt>
          <dd>
            <ul className="flex flex-col gap-1">
              {diagnostics.links.map((link) => (
                <li key={link.href} data-testid="note-link" data-ok={link.ok} className="flex flex-wrap gap-x-2">
                  <span className="wrap-anywhere">{link.href}</span>
                  <span className={cn('font-medium', link.ok ? 'text-ink' : 'text-overdue')}>{t(link.ok ? 'linkOk' : 'linkMissing')}</span>
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
    </dl>
  );
}

export async function AssistantNote({ note, time, actions }: { note: InboxNote; time: string; actions?: ReactNode }) {
  const [t, review, locale] = await Promise.all([getTranslations('assistant'), getTranslations('extraction'), getLocale()]);
  const unread = note.status === 'new';
  const label = KIND_LABEL[note.kind];
  return (
    <article data-testid="inbox-item" data-status={note.status} data-kind={note.kind === 'note' ? undefined : note.kind} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AssistantMonogram />
        <span className="text-small font-medium text-ink">{t('author')}</span>
        {label === null ? null : <span className="text-small text-ink-2">{t(label)}</span>}
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
      {note.proposal?.dueOn == null ? null : (
        <p data-testid="proposal-due" className="text-body text-ink-2 figures">
          {t('proposalDue', { date: formatDate(note.proposal.dueOn, locale) })}
        </p>
      )}
      {note.retry === null || (note.retry === 'self' && note.reviewHref === null) ? null : (
        <p className="text-body break-words text-ink-2">{t(note.retry === 'self' ? 'retrySelf' : note.reviewHref === null ? 'retryAskJob' : 'retryAsk')}</p>
      )}
      {note.reviewHref === null ? null : (
        <Link href={note.reviewHref} data-testid="item-review" className="w-fit text-body font-medium text-ink underline underline-offset-4 hover:decoration-2">
          {note.retry === null ? review('reviewLink') : review('manualLink')}
        </Link>
      )}
      {note.citations.length === 0 ? null : <Citations citations={note.citations} locale={locale} />}
      {note.diagnostics === null ? null : <Diagnostics diagnostics={note.diagnostics} />}
      {actions}
      <Link href={`/assistant?reply=${note.id}`} aria-label={t('replyLabel', { title: note.title })} data-testid="note-reply" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
        <Reply aria-hidden="true" />
        {t('reply')}
      </Link>
    </article>
  );
}
