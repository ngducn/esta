/** The property vocabularies of SPEC §5.3, with no zod, so a client form can import them without the parser. */
export const PROPERTY_KINDS = [
  'townhouse', 'apartment', 'villa', 'rooming_house', 'commercial_space', 'warehouse',
  'residential_land', 'agricultural_land', 'mixed', 'other',
] as const;
export const USE_MODES = ['rental', 'owner_occupied', 'family_use', 'own_business', 'held', 'under_renovation'] as const;
export const LEGAL_STATUSES = ['certified', 'certificate_pending', 'paper_only', 'shared_certificate', 'in_dispute', 'unknown'] as const;
export const ACQUISITION_KINDS = ['purchase', 'inheritance', 'gift', 'allocation', 'other'] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];
export type UseMode = (typeof USE_MODES)[number];
export type LegalStatus = (typeof LEGAL_STATUSES)[number];
export type AcquisitionKind = (typeof ACQUISITION_KINDS)[number];

export type KindDetailKey =
  | 'building_name'
  | 'block'
  | 'floor'
  | 'unit_no'
  | 'management_fee_vnd'
  | 'room_count'
  | 'frontage_m'
  | 'road_width_m';

const LAND = ['frontage_m', 'road_width_m'] as const;

/** SPEC §5.3: the keys each kind may carry, in the order the form shows them. Every key is optional. */
export const KIND_DETAIL_KEYS = {
  townhouse: [],
  apartment: ['building_name', 'block', 'floor', 'unit_no', 'management_fee_vnd'],
  villa: [],
  rooming_house: ['room_count'],
  commercial_space: [],
  warehouse: [],
  residential_land: LAND,
  agricultural_land: LAND,
  mixed: [],
  other: [],
} as const satisfies Record<PropertyKind, readonly KindDetailKey[]>;
