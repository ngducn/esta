import { idSchema } from '@esta/ops';

/** Notes sort before messages at the same instant (P5-12). */
export type Rank = 0 | 1;

/** One entry's place in the thread: its `created_at` in microseconds, as Postgres keeps it, then its rank, then its id. */
export type Cursor = { readonly stamp: string; readonly rank: Rank; readonly id: string };

export type Window = { readonly direction: 'older' | 'newer'; readonly from: Cursor | null; readonly inclusive: boolean; readonly limit: number };

const TIMESTAMP = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/;

/**
 * A PostgREST timestamp as fixed-width UTC with six fraction digits, so two stamps compare as strings and a cursor
 * names its row's exact `created_at`, which a JavaScript Date would round to milliseconds.
 */
export function canonicalStamp(raw: string): string {
  const match = TIMESTAMP.exec(raw);
  const ms = Date.parse(`${match?.[1] ?? ''}${match?.[3] ?? ''}`);
  if (match === null || Number.isNaN(ms)) throw new Error(`Not a PostgREST timestamp: "${raw}"`);
  return `${new Date(ms).toISOString().slice(0, 19)}.${(match[2] ?? '').padEnd(6, '0')}Z`;
}

const CURSOR = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z)_([01])_([0-9a-f-]{36})$/;

export const formatCursor = ({ stamp, rank, id }: Cursor): string => `${stamp}_${rank}_${id}`;

/** A `?before=` value, or null for anything a link of this page would not write. */
export function parseCursor(text: string | undefined): Cursor | null {
  const match = CURSOR.exec(text ?? '');
  if (match === null || !idSchema.safeParse(match[3]).success) return null;
  return { stamp: match[1] ?? '', rank: match[2] === '1' ? 1 : 0, id: match[3] ?? '' };
}

export function compareCursors(a: Cursor, b: Cursor): number {
  if (a.stamp !== b.stamp) return a.stamp < b.stamp ? -1 : 1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The PostgREST `or` filter that keeps a source's rows on the window's side of its cursor, exactly: a row of a lower
 * rank at the cursor's instant is older than it, one of a higher rank newer, and a row of the same rank compares by id.
 */
export function windowFilter(rank: Rank, { direction, from, inclusive }: Window): string | null {
  if (from === null) return null;
  const older = direction === 'older';
  const at = `"${from.stamp}"`;
  const strict = older ? 'lt' : 'gt';
  // This source's rows at the cursor's instant all fall in the window when its rank sorts them there.
  if (rank !== from.rank) return `created_at.${strict}${(rank < from.rank) === older ? 'e' : ''}.${at}`;
  return `created_at.${strict}.${at},and(created_at.eq.${at},id.${strict}${inclusive ? 'e' : ''}.${from.id})`;
}

type WindowQuery<Q> = { or(filter: string): Q; order(column: 'created_at' | 'id', options: { ascending: boolean }): Q; limit(count: number): Q };

/** One source's page of the window: its rows past the cursor, nearest first. */
export function inWindow<Q extends WindowQuery<Q>>(query: Q, rank: Rank, window: Window): Q {
  const filter = windowFilter(rank, window);
  const ascending = window.direction === 'newer';
  return (filter === null ? query : query.or(filter)).order('created_at', { ascending }).order('id', { ascending }).limit(window.limit);
}
