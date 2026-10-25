import { businessDate, type IsoDate } from '@esta/core';
import { wallTime } from '@esta/core/agent';
import { formatDayMonth } from '@esta/core/format';
import { getTranslations } from 'next-intl/server';
import { isOpen, type InboxNote } from '@/server/agent/items';
import { AssistantNote } from './assistant-note';
import { NoteActions, ProposalActions, ProposalDecision } from './note-actions';

function noteTime(note: InboxNote, today: IsoDate, timezone: string): string {
  const day = businessDate(note.createdAt, timezone);
  const time = wallTime(note.createdAt, timezone);
  return day === today ? time : `${formatDayMonth(day, 'vi')} ${time}`;
}

type Translate = Awaited<ReturnType<typeof getTranslations<'assistant'>>>;

/**
 * A note's controls. A proposal shows Đồng ý and Bỏ qua while it waits and the member may decide, and what was decided
 * once it is; a viewer reads it only.
 */
function actionsFor(note: InboxNote, canDecide: boolean, t: Translate) {
  const decided = { approved: t('approved'), notApplicable: t('notApplicable') };
  if (!isOpen(note.status)) return note.proposal === null ? null : <ProposalDecision decision={note.status} labels={decided} />;
  if (note.proposal === null) {
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
      />
    );
  }
  if (!canDecide) return null;
  return (
    <ProposalActions
      id={note.id}
      status={note.status}
      labels={{
        ...decided,
        approve: t('approve'),
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

export async function Inbox({ notes, today, timezone, canDecide }: { notes: readonly InboxNote[]; today: IsoDate; timezone: string; canDecide: boolean }) {
  const t = await getTranslations('assistant');
  const unread = notes.filter((note) => note.status === 'new').length;
  return (
    <section aria-labelledby="inbox-heading" data-testid="inbox" className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="inbox-heading" className="text-h3 font-semibold text-ink">
          {t('inbox')}
        </h2>
        {notes.length === 0 ? null : <p className="text-small text-ink-muted">{t('unreadCount', { count: unread })}</p>}
      </div>
      {notes.length === 0 ? (
        <p data-testid="inbox-empty" className="rounded-lg border border-rule bg-surface p-5 text-body text-pretty text-ink-2 shadow-card sm:p-6">
          {t('inboxEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <AssistantNote
                note={note}
                time={noteTime(note, today, timezone)}
                actions={actionsFor(note, canDecide, t)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
