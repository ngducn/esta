import type { CollectionState } from '../collections/group';
import type { IsoDate } from '../date/iso-date';
import { firstOfMonth } from '../date/calendar';
import type { UseMode } from './kinds';

/**
 * What the list view knows about a property's units: how many have an active lease, how many there are, and the day
 * the earliest unleased one became free (`null` when none is free or none has a date). `collection` is the worst
 * state of its invoices on the Clock's month board (`worstCollectionState`), `null` when that board has none.
 */
export type PropertyStatusFacts = {
  readonly useMode: UseMode;
  readonly vacantSince: IsoDate | null;
  readonly leasedUnitCount: number;
  readonly unitCount: number;
  readonly collection: CollectionState | null;
};

/** A P0-12 `StatusMark` kind and what its word needs. */
export type PropertyStatusMark =
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'due' }
  | { readonly kind: 'paid'; readonly month: IsoDate }
  | { readonly kind: 'leased'; readonly leased: number; readonly total: number }
  | { readonly kind: 'vacant'; readonly since: IsoDate };

type StatusRule = (facts: PropertyStatusFacts, asOf: IsoDate) => readonly PropertyStatusMark[];

/** Every use mode but `rental` shows no mark, because the card already shows its use mode pill. */
const none: StatusRule = () => [];

/**
 * LSE-10 on the card: `Quá hạn 12 ngày`, `Đến hạn` or `Đã thu tháng 10`. [app rule] A month whose worst invoice is not
 * yet due shows no payment mark, because nothing is owed yet and the card already shows occupancy.
 */
function paymentMarks(collection: CollectionState | null, asOf: IsoDate): readonly PropertyStatusMark[] {
  switch (collection?.group) {
    case 'overdue':
      return [{ kind: 'overdue', days: collection.days }];
    case 'due':
      return [{ kind: 'due' }];
    case 'paid':
      return [{ kind: 'paid', month: firstOfMonth(asOf) }];
    default:
      return [];
  }
}

/** The payment mark, then `Đang cho thuê 6/8` beside `Trống từ 01/08`: occupancy, then the oldest vacancy. */
const rental: StatusRule = ({ vacantSince, leasedUnitCount, unitCount, collection }, asOf) => [
  ...paymentMarks(collection, asOf),
  ...(leasedUnitCount > 0 ? [{ kind: 'leased', leased: leasedUnitCount, total: unitCount } as const] : []),
  ...(vacantSince !== null && vacantSince <= asOf ? [{ kind: 'vacant', since: vacantSince } as const] : []),
];

export const PROPERTY_STATUS_RULES = {
  rental,
  owner_occupied: none,
  family_use: none,
  own_business: none,
  held: none,
  under_renovation: none,
} as const satisfies Record<UseMode, StatusRule>;

/** `asOf` is the Clock's business date; `IsoDate` strings order as dates. */
export function propertyStatus(facts: PropertyStatusFacts, asOf: IsoDate): readonly PropertyStatusMark[] {
  return PROPERTY_STATUS_RULES[facts.useMode](facts, asOf);
}
