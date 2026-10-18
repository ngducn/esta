import type { IsoDate } from '../date/iso-date';
import type { UseMode } from './kinds';

/**
 * What the list view knows about a property's units: how many have an active lease, how many there are, and the day
 * the earliest unleased one became free (`null` when none is free or none has a date).
 */
export type PropertyStatusFacts = {
  readonly useMode: UseMode;
  readonly vacantSince: IsoDate | null;
  readonly leasedUnitCount: number;
  readonly unitCount: number;
};

/** A P0-12 `StatusMark` kind and what its word needs. P3-09 adds the payment marks. */
export type PropertyStatusMark = { readonly kind: 'leased'; readonly leased: number; readonly total: number } | { readonly kind: 'vacant'; readonly since: IsoDate };

type StatusRule = (facts: PropertyStatusFacts, asOf: IsoDate) => readonly PropertyStatusMark[];

/** Every use mode but `rental` shows no mark, because the card already shows its use mode pill. */
const none: StatusRule = () => [];

/** `Đang cho thuê 6/8` beside `Trống từ 01/08`: occupancy first, then the oldest vacancy. */
const rental: StatusRule = ({ vacantSince, leasedUnitCount, unitCount }, asOf) => [
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
