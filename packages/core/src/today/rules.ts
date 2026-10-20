import { collectionState, type CollectionCandidate } from '../collections/group';
import { addDays, daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { documentExpiry, EXPIRY_WINDOW_DAYS } from '../documents/expiry';
import type { LeaseStatus } from '../lease/types';

/** [app rule] Home offers `Gia hạn` once a lease has 30 days or fewer left, the window watch rule W3 calls `action`. */
export const LEASE_ENDING_DAYS = 30;
export const DOCUMENT_EXPIRING_DAYS = EXPIRY_WINDOW_DAYS;

/** Home shows at most this many items and points to Thu tiền for the rest. */
export const TODAY_LIMIT = 7;

/** A bill on the collections board for the Clock's month, so Home and the board read one status. */
export type TodayBill = Pick<CollectionCandidate, 'invoiceId' | 'propertyName' | 'unitLabel' | 'dueDate' | 'paymentStatus'>;

export type TodayLease = {
  readonly leaseId: string;
  readonly propertyName: string;
  readonly unitLabel: string;
  readonly status: LeaseStatus;
  readonly endDate: IsoDate | null;
  /** Another lease renews this one: `renewal_of_lease_id` points at it and it is past draft, as `renew_lease` counts it. */
  readonly renewed: boolean;
};

export type TodayDocument = { readonly documentId: string; readonly title: string; readonly expiresOn: IsoDate | null };

/** A document whose latest extraction waits in `needs_review` (`document_status`). */
export type TodayReview = { readonly documentId: string; readonly title: string };

/** What Home reads on `asOf`. Each list may hold rows a rule passes over; the rules decide what is due today. */
export type TodaySnapshot = {
  readonly bills: readonly TodayBill[];
  readonly leases: readonly TodayLease[];
  readonly documents: readonly TodayDocument[];
  readonly reviews: readonly TodayReview[];
};

/** The one thing each item lets you do: open the payment sheet, the renew sheet, the document or its review. */
export type TodayAction = 'recordPayment' | 'renew' | 'openDocument' | 'review';

type Of<S extends TodaySnapshot, K extends keyof TodaySnapshot> = S[K][number];

export type TodayItem<S extends TodaySnapshot = TodaySnapshot> =
  | { readonly rule: 'overdue_invoice'; readonly action: 'recordPayment'; readonly date: IsoDate; readonly days: number; readonly bill: Of<S, 'bills'> }
  | { readonly rule: 'due_today'; readonly action: 'recordPayment'; readonly date: IsoDate; readonly bill: Of<S, 'bills'> }
  | { readonly rule: 'lease_ending'; readonly action: 'renew'; readonly date: IsoDate; readonly days: number; readonly lease: Of<S, 'leases'> }
  | { readonly rule: 'document_expiring'; readonly action: 'openDocument'; readonly date: IsoDate; readonly days: number; readonly document: Of<S, 'documents'> }
  | { readonly rule: 'extraction_waiting'; readonly action: 'review'; readonly date: IsoDate; readonly review: Of<S, 'reviews'> };

export type TodayRuleId = TodayItem['rule'];

export type TodayRule = {
  readonly id: TodayRuleId;
  /** Lower comes first. */
  readonly priority: number;
  readonly action: TodayAction;
  readonly find: <S extends TodaySnapshot>(snapshot: S, asOf: IsoDate) => TodayItem<S>[];
};

/**
 * Home's `Cần làm hôm nay`, as pure rules over one snapshot on the Clock's date. A late bill comes first, then what
 * expires if nobody acts (a lease, a paper), then a reading waiting for review, then the bills due today, so the items
 * the cap hides are bills, which `Xem tất cả ở Thu tiền` lists. A bill's state is the board's `collectionState`, so a
 * paid, voided or drafted bill never shows and an overdue one reads the same days here and there.
 */
export const TODAY_RULES: readonly TodayRule[] = [
  {
    id: 'overdue_invoice',
    priority: 1,
    action: 'recordPayment',
    find: (snapshot, asOf) =>
      snapshot.bills.flatMap((bill) => {
        const state = collectionState(bill, asOf);
        return state.group === 'overdue' ? [{ rule: 'overdue_invoice', action: 'recordPayment', date: bill.dueDate, days: state.days, bill } as const] : [];
      }),
  },
  {
    id: 'lease_ending',
    priority: 2,
    action: 'renew',
    find: (snapshot, asOf) =>
      snapshot.leases.flatMap((lease) => {
        if (lease.status !== 'active' || lease.renewed || lease.endDate === null) return [];
        const days = daysBetween(asOf, lease.endDate);
        return days >= 0 && days <= LEASE_ENDING_DAYS ? [{ rule: 'lease_ending', action: 'renew', date: lease.endDate, days, lease } as const] : [];
      }),
  },
  {
    id: 'document_expiring',
    priority: 3,
    action: 'openDocument',
    find: (snapshot, asOf) =>
      snapshot.documents.flatMap((document) => {
        const expiry = documentExpiry(document.expiresOn, asOf);
        return expiry.state === 'expires_in' && document.expiresOn !== null
          ? [{ rule: 'document_expiring', action: 'openDocument', date: document.expiresOn, days: expiry.days, document } as const]
          : [];
      }),
  },
  {
    id: 'extraction_waiting',
    priority: 4,
    action: 'review',
    find: (snapshot, asOf) => snapshot.reviews.map((review) => ({ rule: 'extraction_waiting', action: 'review', date: asOf, review }) as const),
  },
  {
    id: 'due_today',
    priority: 5,
    action: 'recordPayment',
    find: (snapshot, asOf) => snapshot.bills.flatMap((bill) => (collectionState(bill, asOf).group === 'due' ? [{ rule: 'due_today', action: 'recordPayment', date: bill.dueDate, bill } as const] : [])),
  },
];

/** The last day a lease or a document can end on and still be read for today's list. */
export const todayHorizon = (asOf: IsoDate): { readonly leases: IsoDate; readonly documents: IsoDate } => ({
  leases: addDays(asOf, LEASE_ENDING_DAYS),
  documents: addDays(asOf, DOCUMENT_EXPIRING_DAYS),
});

const collator = new Intl.Collator('vi', { numeric: true });

function place(item: TodayItem): string {
  switch (item.rule) {
    case 'overdue_invoice':
    case 'due_today':
      return `${item.bill.propertyName}\u0000${item.bill.unitLabel}`;
    case 'lease_ending':
      return `${item.lease.propertyName}\u0000${item.lease.unitLabel}`;
    case 'document_expiring':
      return item.document.title;
    case 'extraction_waiting':
      return item.review.title;
  }
}

export type TodayList<S extends TodaySnapshot> = { readonly items: readonly TodayItem<S>[]; readonly total: number };

/** Every rule's items, by priority, then date, then place or title, capped at TODAY_LIMIT; `total` counts them all. */
export function todayItems<S extends TodaySnapshot>(snapshot: S, asOf: IsoDate): TodayList<S> {
  const all = TODAY_RULES.flatMap((rule) => rule.find(snapshot, asOf).map((item) => ({ item, priority: rule.priority })))
    .toSorted((a, b) => a.priority - b.priority || a.item.date.localeCompare(b.item.date) || collator.compare(place(a.item), place(b.item)))
    .map(({ item }) => item);
  return { items: all.slice(0, TODAY_LIMIT), total: all.length };
}
