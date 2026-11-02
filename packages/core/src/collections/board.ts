import { vnd, type Vnd } from '../money/vnd';
import { COLLECTION_GROUPS, type CollectionCandidate, type CollectionGroup } from './group';

/** The board's status tabs, read from `?status=`: every bill, or one LSE-10 group. */
export const BOARD_FILTERS = ['all', ...COLLECTION_GROUPS] as const;
export type BoardFilter = (typeof BOARD_FILTERS)[number];

export function parseBoardFilter(param: string | undefined): BoardFilter {
  return BOARD_FILTERS.find((filter) => filter === param) ?? 'all';
}

export function boardGroups<R extends CollectionCandidate>(board: readonly CollectionGroup<R>[], filter: BoardFilter): readonly CollectionGroup<R>[] {
  return filter === 'all' ? board : board.filter((group) => group.key === filter);
}

export type BoardTotals = { readonly count: number; readonly owedVnd: Vnd };

export function boardTotals<R extends CollectionCandidate>(groups: readonly CollectionGroup<R>[]): BoardTotals {
  const rows = groups.flatMap((group) => group.items.map((item) => item.row));
  return { count: rows.length, owedVnd: vnd(rows.reduce((sum, row) => sum + row.outstandingVnd, 0)) };
}

export function longestOverdueDays<R extends CollectionCandidate>(board: readonly CollectionGroup<R>[]): number | null {
  const days = board.flatMap((group) => group.items.flatMap((item) => (item.state.group === 'overdue' ? [item.state.days] : [])));
  return days.length === 0 ? null : Math.max(...days);
}
