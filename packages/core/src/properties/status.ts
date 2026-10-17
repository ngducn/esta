import type { IsoDate } from '../date/iso-date';
import type { UseMode } from './kinds';

/** What the list view knows about a property's units: the earliest `available_from`, `null` when none has one. */
export type PropertyStatusFacts = { readonly useMode: UseMode; readonly vacantSince: IsoDate | null };

/** A P0-12 `StatusMark` kind and what its word needs. P3-07 and P3-09 add the lease and payment marks. */
export type PropertyStatusMark = { readonly kind: 'vacant'; readonly since: IsoDate };

type StatusRule = (facts: PropertyStatusFacts, asOf: IsoDate) => PropertyStatusMark | null;

/** Every use mode but `rental` shows no mark, because the card already shows its use mode pill. */
const none: StatusRule = () => null;

export const PROPERTY_STATUS_RULES = {
  rental: ({ vacantSince }, asOf) => (vacantSince !== null && vacantSince <= asOf ? { kind: 'vacant', since: vacantSince } : null),
  owner_occupied: none,
  family_use: none,
  own_business: none,
  held: none,
  under_renovation: none,
} as const satisfies Record<UseMode, StatusRule>;

/** `asOf` is the Clock's business date; `IsoDate` strings order as dates. */
export function propertyStatus(facts: PropertyStatusFacts, asOf: IsoDate): PropertyStatusMark | null {
  return PROPERTY_STATUS_RULES[facts.useMode](facts, asOf);
}
