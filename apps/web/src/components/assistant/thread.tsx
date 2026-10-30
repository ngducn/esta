import { businessDate, type Instant, type IsoDate } from '@esta/core';
import { wallTime } from '@esta/core/agent';
import { isOpenNote, type Suggestion } from '@esta/core/assistant';
import { formatDayMonth } from '@esta/core/format';
import { visibleText } from '@esta/core/guard';
import { PROPOSAL_TYPES } from '@esta/core/proposals';
import { MAX_QUESTION_LENGTH } from '@esta/ops';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { buttonVariants } from '@/components/ui/button-variants';
import type { ConversationMessage } from '@/server/agent/conversations';
import type { InboxNote } from '@/server/agent/items';
import type { ProposalDetails } from '@/server/agent/proposal-details';
import type { Thread, ThreadEntry } from '@/server/agent/thread';
import type { TopicChoice } from '@/server/agent/topic';
import type { ReminderLabels } from '@/server/reminders/board';
import { AnswerStream } from './answer-stream';
import { AnswerView } from './answer-view';
import { AssistantNote } from './assistant-note';
import { CopyAnswer } from './copy-answer';
import { AssistantMonogram } from './monogram';
import { NoteActions, ProposalActions, ProposalDecision, RestoreNote, type ProposalExtras } from './note-actions';
import { ThreadComposer, type ComposerState } from './thread-composer';
import { ThreadScroll } from './thread-scroll';

function entryTime(at: Instant, today: IsoDate, timezone: string): string {
  const day = businessDate(at, timezone);
  const time = wallTime(at, timezone);
  return day === today ? time : `${formatDayMonth(day, 'vi')} ${time}`;
}

type Translate = Awaited<ReturnType<typeof getTranslations<'assistant'>>>;

export type ProposalContext = { readonly details: ReadonlyMap<string, ProposalDetails>; readonly reminderLabels: ReminderLabels | null };

function extrasFor(note: InboxNote, { details, reminderLabels }: ProposalContext, t: Translate): ProposalExtras {
  const detail = details.get(note.id);
  const parsed = note.proposal?.parsed ?? null;
  const reminder = detail?.reminder ?? null;
  const leaseHref = detail?.leaseHref ?? null;
  return {
    confirm: detail?.confirm ?? null,
    needsConfirm: parsed !== null && PROPOSAL_TYPES[parsed.type].confirm === 'names_object',
    reminder: reminder === null || reminderLabels === null ? null : { label: t('openReminder'), title: reminder.draft.place, target: reminder, labels: reminderLabels },
    lease: leaseHref === null ? null : { href: leaseHref, label: t('openLease') },
  };
}

/**
 * A note's controls. A proposal shows Đồng ý and Bỏ qua while it waits and the member may decide, and what was decided
 * once it is; a viewer reads it only.
 */
function actionsFor(note: InboxNote, canDecide: boolean, context: ProposalContext, t: Translate) {
  const decided = { approved: t('approved'), notApplicable: t('notApplicable') };
  if (note.proposal === null) {
    if (!isOpenNote(note.status)) return null;
    return (
      <NoteActions
        id={note.id}
        status={note.status}
        labels={{
          markRead: t('markRead'),
          markReadLabel: t('markReadLabel', { title: note.title }),
          dismiss: t('dismiss'),
          dismissLabel: t('dismissLabel', { title: note.title }),
          dismissed: t('dismissed'),
          failed: t('noteFailed'),
          restoreFailed: t('restoreFailed'),
        }}
        {...(note.retry === 'self'
          ? { retry: { retry: t('retryJob'), retryLabel: t('retryJobLabel', { title: note.title }), queued: t('retryQueued'), failed: t('retryFailed') } }
          : {})}
      />
    );
  }
  const status = note.status;
  const settled = status === 'approved' || status === 'failed';
  if (!canDecide) return settled ? <ProposalDecision decision={status} labels={decided} extras={extrasFor(note, context, t)} /> : null;
  if (!settled && !isOpenNote(status)) return null;
  return (
    <ProposalActions
      id={note.id}
      status={status}
      extras={extrasFor(note, context, t)}
      labels={{
        ...decided,
        approve: t('approve'),
        cancel: t('confirmCancel'),
        approveLabel: t('approveLabel', { title: note.title }),
        skip: t('skip'),
        skipLabel: t('skipLabel', { title: note.title }),
        skipped: t('skipped'),
        failed: t('approveFailed'),
        restoreFailed: t('restoreFailed'),
      }}
    />
  );
}

/**
 * A hidden note, or a note whose work is done (a failed job run again, a document reviewed), keeps its place as one
 * muted line, so the thread reads in the order it happened.
 */
function SettledNote({ note, time, canRestore, t }: { note: InboxNote; time: string; canRestore: boolean; t: Translate }) {
  const hidden = note.status === 'dismissed';
  return (
    <div data-testid="note-settled" data-status={note.status} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-rule px-4 py-1.5">
      <p className="min-w-0 flex-1 text-small break-words text-ink-muted">
        <time dateTime={note.createdAt} className="figures">
          {time}
        </time>{' '}
        {t(hidden ? 'hiddenNote' : 'handledNote', { title: note.title })}
      </p>
      {hidden && canRestore ? <RestoreNote id={note.id} labels={{ undo: t('undoHide'), undoLabel: t('undoHideLabel', { title: note.title }), failed: t('restoreFailed') }} /> : null}
    </div>
  );
}

type AskTranslate = Awaited<ReturnType<typeof getTranslations<'assistant.ask'>>>;

const topicLine = (topic: { readonly kind: 'item' | 'property'; readonly name: string }, ask: AskTranslate) =>
  topic.kind === 'item' ? ask('replyTo', { title: topic.name }) : ask('about', { property: topic.name });

function Question({ message, time, t, ask }: { message: ConversationMessage; time: string; t: Translate; ask: AskTranslate }) {
  const topic = message.topic;
  return (
    <div data-testid="question" className="ml-10 flex flex-col items-end gap-1 sm:ml-24">
      <p className="text-small text-ink-muted figures">
        <time dateTime={message.createdAt}>{t('sentAt', { time })}</time>
      </p>
      {topic === null ? null : topic.href === null ? (
        <p data-testid="question-topic" className="max-w-prose text-small break-words text-ink-2">
          {topicLine(topic, ask)}
        </p>
      ) : (
        <Link href={topic.href} data-testid="question-topic" className="max-w-prose text-small font-medium break-words text-ink-2 underline underline-offset-4 hover:text-ink">
          {topicLine(topic, ask)}
        </Link>
      )}
      <p className="max-w-prose rounded-lg bg-accent-tint px-4 py-3 text-body break-words whitespace-pre-line text-ink">{message.content}</p>
    </div>
  );
}

function Answer({ message, time, t, ask }: { message: ConversationMessage; time: string; t: Translate; ask: AskTranslate }) {
  const labels = { streaming: ask('answering'), deferred: ask('deferred'), error: ask('answerFailed'), stalled: ask('stalled') };
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AssistantMonogram />
        <span className="text-small font-medium text-ink">{t('author')}</span>
        <time dateTime={message.createdAt} className="text-small text-ink-muted figures">
          {time}
        </time>
      </header>
      {message.status === 'streaming' ? (
        <AnswerStream id={message.id} conversationId={message.conversationId} initial={{ content: message.content, status: message.status, refs: message.refs }} labels={labels} />
      ) : (
        <AnswerView shown={message} labels={labels}>
          <SafeMarkdown refs={message.refs} className="max-w-prose">
            {message.content}
          </SafeMarkdown>
        </AnswerView>
      )}
      {message.status === 'done' ? (
        <CopyAnswer
          text={visibleText(message.content, { tables: true })}
          labels={{ copy: t('copyAnswer'), copyLabel: t('copyAnswerLabel', { time }), copied: t('answerCopied'), failed: t('copyFailed') }}
        />
      ) : null}
    </article>
  );
}

/** The reply box waits while the newest answer streams, and for tomorrow once the day's cap holds it. */
function composerState(entries: readonly ThreadEntry[]): ComposerState {
  const last = entries.findLast((entry) => entry.kind === 'answer');
  if (last?.kind !== 'answer') return 'ready';
  return last.message.status === 'streaming' ? 'busy' : last.message.status === 'deferred' ? 'deferred' : 'ready';
}

export async function ThreadView({
  thread,
  note,
  today,
  timezone,
  canDecide,
  isOperator,
  proposals,
  topic,
  suggestions,
}: {
  thread: Thread;
  note: string | null;
  today: IsoDate;
  timezone: string;
  canDecide: boolean;
  isOperator: boolean;
  proposals: ProposalContext;
  topic: TopicChoice | null;
  suggestions: readonly Suggestion[];
}) {
  const [t, ask] = await Promise.all([getTranslations('assistant'), getTranslations('assistant.ask')]);
  const opened = note !== null && thread.entries.some((entry) => entry.kind === 'note' && entry.note.id === note);
  const render = (entry: ThreadEntry) => {
    if (entry.kind !== 'note') {
      const time = entryTime(entry.message.createdAt, today, timezone);
      return entry.kind === 'question' ? <Question message={entry.message} time={time} t={t} ask={ask} /> : <Answer message={entry.message} time={time} t={t} ask={ask} />;
    }
    const time = entryTime(entry.note.createdAt, today, timezone);
    if (entry.note.status === 'dismissed' || entry.note.status === 'done') return <SettledNote note={entry.note} time={time} canRestore={canDecide} t={t} />;
    return <AssistantNote note={entry.note} time={time} actions={actionsFor(entry.note, canDecide, proposals, t)} />;
  };
  return (
    <section id="thread" aria-labelledby="thread-heading" data-testid="thread" className="flex max-w-3xl flex-col gap-4">
      <h2 id="thread-heading" className="sr-only">
        {t('thread')}
      </h2>
      {thread.before === null ? null : (
        <Link href={`/assistant?before=${thread.before}`} data-testid="thread-older" className={buttonVariants({ variant: 'outline', className: 'self-center' })}>
          {t('threadOlder')}
        </Link>
      )}
      {thread.entries.length === 0 ? (
        <p data-testid="thread-empty" className="rounded-lg border border-rule bg-surface p-5 text-body text-pretty text-ink-2 shadow-card sm:p-6">
          {t('threadEmpty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {thread.entries.map((entry) => (
            <li key={entry.cursor.id} id={entry.kind === 'note' ? `note-${entry.note.id}` : undefined} data-testid="thread-entry" data-kind={entry.kind} className="scroll-mt-4">
              {render(entry)}
            </li>
          ))}
        </ol>
      )}
      {thread.newer ? (
        <Link href="/assistant" data-testid="thread-newest" className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-fit sm:self-center' })}>
          {t('threadNewest')}
        </Link>
      ) : (
        <ThreadComposer
          maxLength={MAX_QUESTION_LENGTH}
          state={composerState(thread.entries)}
          thinkHarder={isOperator ? { label: ask('thinkHarder'), hint: ask('thinkHarderHint') } : null}
          suggestions={{
            label: t('suggestionsLabel'),
            items: suggestions.map(({ noteId, key, params }) => ({ text: t(`suggestions.${key}`, params), topic: { kind: 'item', itemId: noteId } })),
          }}
          topic={
            topic === null
              ? null
              : {
                  topic: topic.topic,
                  label: topicLine({ kind: topic.topic.kind, name: topic.name }, ask),
                  clear: ask('clearTopic'),
                  clearLabel: ask('clearTopicLabel', { topic: topic.name }),
                }
          }
          labels={{
            message: ask('message'),
            placeholder: ask('placeholder'),
            send: ask('send'),
            sending: ask('sending'),
            empty: ask('emptyQuestion'),
            long: ask('longQuestion'),
            failed: ask('sendFailed'),
            busy: ask('busy'),
            deferred: ask('deferredBox'),
          }}
        />
      )}
      <ThreadScroll note={opened ? `note-${note}` : null} newest={thread.entries.at(-1)?.cursor.id ?? null} />
    </section>
  );
}
