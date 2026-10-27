import 'server-only';
import type { Member } from '@/server/member';
import { listMessages, type ConversationMessage } from './conversations';
import { listNotes, noteCursor, type InboxNote } from './items';
import { compareCursors, formatCursor, parseCursor, type Cursor, type Window } from './thread-cursor';

/** One entry of the member's thread with Trợ lý: a note it left, a message she sent, or its answer (AGENT.md §5.6). */
export type ThreadEntry =
  | { readonly kind: 'note'; readonly cursor: Cursor; readonly note: InboxNote }
  | { readonly kind: 'question' | 'answer'; readonly cursor: Cursor; readonly message: ConversationMessage };

/**
 * A page of the thread, oldest first. `before` is the `?before=` cursor of the page older than it, and `newer` says the
 * thread holds entries after it, so the page shows a link to the newest instead of the reply box.
 */
export type Thread = { readonly entries: readonly ThreadEntry[]; readonly before: string | null; readonly newer: boolean };

export const THREAD_PAGE = 40;

type ThreadMember = Pick<Member, 'household' | 'role' | 'isOperator'>;

/** The window's entries, nearest the cursor first, and whether more lie beyond them. */
async function side(member: ThreadMember, window: Window): Promise<{ entries: ThreadEntry[]; more: boolean }> {
  const fetched = { ...window, limit: window.limit + 1 };
  const [notes, messages] = await Promise.all([listNotes(member, fetched), listMessages(member.household.id, fetched)]);
  const entries: ThreadEntry[] = [
    ...notes.map((note): ThreadEntry => ({ kind: 'note', cursor: note.cursor, note })),
    ...messages.map((message): ThreadEntry => ({ kind: message.role === 'user' ? 'question' : 'answer', cursor: message.cursor, message })),
  ];
  const sign = window.direction === 'older' ? -1 : 1;
  entries.sort((a, b) => sign * compareCursors(a.cursor, b.cursor));
  return { entries: entries.slice(0, window.limit), more: entries.length > window.limit };
}

const beforeOf = (older: { entries: readonly ThreadEntry[]; more: boolean }) => {
  const oldest = older.entries.at(-1);
  return older.more && oldest !== undefined ? formatCursor(oldest.cursor) : null;
};

/**
 * The member's thread: the notes RLS lets her read beside the messages of the conversations she started, newest
 * page last. `before` pages back from a `?before=` cursor; `note` opens the page around that note.
 */
export async function loadThread(member: ThreadMember, { before, note }: { readonly before?: string; readonly note?: string } = {}): Promise<Thread> {
  const around = note === undefined ? null : await noteCursor(member.household.id, note);
  if (around !== null) {
    const half = THREAD_PAGE / 2;
    const [older, newer] = await Promise.all([
      side(member, { direction: 'older', from: around, inclusive: true, limit: half }),
      side(member, { direction: 'newer', from: around, inclusive: false, limit: half }),
    ]);
    return { entries: [...older.entries.toReversed(), ...newer.entries], before: beforeOf(older), newer: newer.more };
  }
  const from = parseCursor(before);
  const older = await side(member, { direction: 'older', from, inclusive: false, limit: THREAD_PAGE });
  return { entries: older.entries.toReversed(), before: beforeOf(older), newer: from !== null };
}
