import type { PaymentStatus } from '../allocation/status';
import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { firstOfMonth } from '../date/calendar';

/** The board's groups in the order Mẹ reads them (LSE-10). */
export const COLLECTION_GROUPS = ['overdue', 'due', 'notDue', 'paid'] as const;
export type CollectionGroupKey = (typeof COLLECTION_GROUPS)[number];

/** One issued invoice as `collection_candidates` returns it. */
export type CollectionCandidate = {
  readonly invoiceId: string;
  readonly propertyId: string;
  readonly propertyName: string;
  readonly unitLabel: string;
  readonly dueDate: IsoDate;
  readonly totalVnd: Vnd;
  readonly allocatedVnd: Vnd;
  readonly outstandingVnd: Vnd;
  readonly paymentStatus: PaymentStatus;
};

export type CollectionState =
  | { readonly group: 'overdue'; readonly days: number }
  | { readonly group: 'due' }
  | { readonly group: 'notDue' }
  | { readonly group: 'paid' };

export type CollectionItem<R extends CollectionCandidate> = {
  readonly row: R;
  readonly state: CollectionState;
  /** What the row shows: still owed, or collected once paid. */
  readonly amountVnd: Vnd;
  /** The first of the earlier month the invoice was due in, when it carries into this board (`từ tháng 9`). */
  readonly carriedFrom: IsoDate | null;
};

export type CollectionGroup<R extends CollectionCandidate> = {
  readonly key: CollectionGroupKey;
  readonly items: readonly CollectionItem<R>[];
  readonly totalVnd: Vnd;
};

/** Where an invoice stands on `asOf`, the Clock's business date. */
export function collectionState(row: Pick<CollectionCandidate, 'dueDate' | 'paymentStatus'>, asOf: IsoDate): CollectionState {
  if (row.paymentStatus === 'paid' || row.paymentStatus === 'overpaid') return { group: 'paid' };
  if (row.dueDate < asOf) return { group: 'overdue', days: daysBetween(row.dueDate, asOf) };
  return row.dueDate === asOf ? { group: 'due' } : { group: 'notDue' };
}

const collator = new Intl.Collator('vi', { numeric: true });

function byDueThenPlace(a: CollectionCandidate, b: CollectionCandidate): number {
  return a.dueDate.localeCompare(b.dueDate) || collator.compare(a.propertyName, b.propertyName) || collator.compare(a.unitLabel, b.unitLabel);
}

/**
 * LSE-10: the board for `month` (any day in it) on `asOf`. Every group is present, in COLLECTION_GROUPS order, each
 * sorted oldest due first and then by place, so an empty group still reads as a zero count.
 */
export function groupCollections<R extends CollectionCandidate>(rows: readonly R[], month: IsoDate, asOf: IsoDate): CollectionGroup<R>[] {
  const start = firstOfMonth(month);
  const items = rows.toSorted(byDueThenPlace).map((row): CollectionItem<R> => {
    const state = collectionState(row, asOf);
    return {
      row,
      state,
      amountVnd: state.group === 'paid' ? row.allocatedVnd : row.outstandingVnd,
      carriedFrom: row.dueDate < start ? firstOfMonth(row.dueDate) : null,
    };
  });
  return COLLECTION_GROUPS.map((key) => {
    const own = items.filter((item) => item.state.group === key);
    return { key, items: own, totalVnd: vnd(own.reduce((sum, item) => sum + item.amountVnd, 0)) };
  });
}

/** `Đã thu X / Y` for a board's month. */
export type MonthCollected = { readonly collectedVnd: Vnd; readonly billedVnd: Vnd };

/**
 * Y is what the issued bills due in the board's month charge; X is what payments allocated to exactly those bills, each
 * capped at its bill, so a credit or an overpayment never lifts X past Y. Bills carried in from earlier months count
 * toward neither, so a late September rent paid in October leaves October's figure where it was.
 */
export function monthCollected<R extends CollectionCandidate>(board: readonly CollectionGroup<R>[]): MonthCollected {
  const own = board.flatMap((group) => group.items).filter((item) => item.carriedFrom === null);
  return {
    collectedVnd: vnd(own.reduce((sum, { row }) => sum + Math.min(row.allocatedVnd, row.totalVnd), 0)),
    billedVnd: vnd(own.reduce((sum, { row }) => sum + row.totalVnd, 0)),
  };
}

/** The state a property card shows for its month: the longest overdue, else due today, else not yet due, else paid. */
export function worstCollectionState(states: readonly CollectionState[]): CollectionState | null {
  const rank = (state: CollectionState) => COLLECTION_GROUPS.indexOf(state.group);
  return states.reduce<CollectionState | null>((worst, state) => {
    if (worst === null || rank(state) < rank(worst)) return state;
    if (state.group === 'overdue' && worst.group === 'overdue' && state.days > worst.days) return state;
    return worst;
  }, null);
}
