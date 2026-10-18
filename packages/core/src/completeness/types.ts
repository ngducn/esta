import type { PropertyKind } from '../properties/kinds';

/** One parsed row of `public.property_completeness_facts`. */
export type CompletenessFacts = {
  readonly propertyId: string;
  readonly kind: PropertyKind;
  /** The current address names a commune and a street. */
  readonly hasCurrentAddress: boolean;
  readonly hasLocation: boolean;
  /** Both `acquired_on` and `acquisition_kind` are set. */
  readonly hasAcquisition: boolean;
  readonly parcelCount: number;
  /** The first parcel with no parcel number or no map sheet number. */
  readonly parcelWithoutNumberId: string | null;
  readonly parcelWithoutAreaId: string | null;
  readonly structureCount: number;
  readonly structureWithoutFloorAreaId: string | null;
  readonly shareTotalBp: number;
  readonly utilityAccountCount: number;
  /** Live `certificate` documents of the property. */
  readonly certificateDocumentCount: number;
  /** Live `photo` documents, plus one when the property has a cover photo. */
  readonly photoCount: number;
};

/** Where a failing check sends Mẹ: `path` under `/properties/<id>` (empty for the overview) and the id of the field. */
export type CompletenessLink = { readonly path: string; readonly anchor: string };

export type CompletenessCheck<Id extends string = string> = {
  /** Also the message key under `completeness.checks`. */
  readonly id: Id;
  readonly weight: number;
  readonly kinds: 'all' | readonly PropertyKind[];
  readonly passes: (facts: CompletenessFacts) => boolean;
  readonly link: (facts: CompletenessFacts) => CompletenessLink;
};

export type MissingItem<Id extends string = string> = { readonly id: Id; readonly href: string };

export type CompletenessResult<Id extends string = string> = {
  /** The integer percent of passing weight over the weight of the checks that apply to the kind. */
  readonly percent: number;
  /** Failing checks by weight, then registry order. */
  readonly failing: readonly MissingItem<Id>[];
};
