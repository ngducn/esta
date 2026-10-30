import { mostSevereFirst, type WatchSeverity } from '../watch/types';

/** A note is open until Mẹ dismisses it or a decision settles it. */
export const OPEN_NOTE_STATUSES = ['new', 'read'] as const;

export type OpenNoteStatus = (typeof OPEN_NOTE_STATUSES)[number];

export const isOpenNote = (status: string): status is OpenNoteStatus => OPEN_NOTE_STATUSES.some((open) => open === status);

export type RankedNote = { readonly id: string; readonly severity: WatchSeverity; readonly stamp: string };

/** The order open notes lead in: the most severe first, then the newest, and the id last so two notes made in one instant never swap between reads. */
export const byPriority = (a: RankedNote, b: RankedNote): number =>
  mostSevereFirst(a.severity, b.severity) || (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
