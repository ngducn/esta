import { businessDate, type IsoDate } from '@esta/core';
import { wallTime } from '@esta/core/agent';
import { formatDayMonth } from '@esta/core/format';
import { getTranslations } from 'next-intl/server';
import type { InboxNote } from '@/server/agent/items';
import { AssistantNote } from './assistant-note';
import { NoteActions } from './note-actions';

/** `HH:mm` for a note from today, `dd/MM HH:mm` for an earlier one. */
function noteTime(note: InboxNote, today: IsoDate, timezone: string): string {
  const day = businessDate(note.createdAt, timezone);
  const time = wallTime(note.createdAt, timezone);
  return day === today ? time : `${formatDayMonth(day, 'vi')} ${time}`;
}

/** Trợ lý's notes on the ground, one card each, newest first. */
export async function Inbox({ notes, today, timezone }: { notes: readonly InboxNote[]; today: IsoDate; timezone: string }) {
  const t = await getTranslations('assistant');
  const unread = notes.filter((note) => note.status === 'new').length;
  return (
    <section aria-labelledby="inbox-heading" data-testid="inbox" className="flex flex-col gap-3">
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
                actions={
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
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
