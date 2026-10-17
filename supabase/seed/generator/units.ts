import { publicTable, type HouseholdSeed } from './context.ts';
import { householdId } from './households.ts';
import { seedId, type SeedId } from './ids.ts';
import type { PropertySeedKey } from './properties.ts';

type UnitSeed = {
  label: string;
  kind: 'whole' | 'room' | 'floor' | 'shop' | 'lot';
  area_m2: number | null;
  list_rent_vnd: number | null;
  available_from: string | null;
};

const room = (n: number, list_rent_vnd: number, area_m2: number, available_from: string | null = null): UnitSeed => ({
  label: `Phòng ${n}`,
  kind: 'room',
  area_m2,
  list_rent_vnd,
  available_from,
});

const whole = (list_rent_vnd: number): UnitSeed => ({ label: 'Toàn bộ', kind: 'whole', area_m2: null, list_rent_vnd, available_from: null });

/** SPEC §9.3. Dĩ An's rooms add up to 21.400.000 VND, and Phòng 8 has stood empty since 2026-08-01. */
export const UNIT_SEEDS: Record<PropertySeedKey, readonly UnitSeed[]> = {
  q7: [whole(15_000_000)],
  'thu-duc': [whole(9_000_000)],
  'di-an': [
    room(1, 2_500_000, 16),
    room(2, 2_500_000, 16),
    room(3, 2_500_000, 16),
    room(4, 2_500_000, 16),
    room(5, 2_800_000, 20),
    room(6, 2_800_000, 20),
    room(7, 2_800_000, 20),
    room(8, 3_000_000, 24, '2026-08-01'),
  ],
  q1: [{ label: 'Mặt bằng tầng trệt', kind: 'shop', area_m2: 95.4, list_rent_vnd: 30_000_000, available_from: null }],
  'bien-hoa': [whole(12_000_000)],
  'long-an': [{ label: 'Lô đất', kind: 'lot', area_m2: null, list_rent_vnd: null, available_from: null }],
  'bao-loc': [{ label: 'Lô đất', kind: 'lot', area_m2: 150, list_rent_vnd: null, available_from: null }],
};

export const propertyId = (household: HouseholdSeed, key: PropertySeedKey) => seedId(`seed:property:${household.key}:${key}`);

/** The id `private.whole_unit_id` gives the unit the property insert trigger creates. */
export const wholeUnitId = (property: SeedId) => seedId(`esta:unit:whole:${property}`);

export const unitId = (household: HouseholdSeed, key: PropertySeedKey, seed: UnitSeed, index: number) =>
  seed.kind === 'whole' ? wholeUnitId(propertyId(household, key)) : seedId(`seed:unit:${household.key}:${key}:${index + 1}`);

/** Upserts, so a `whole` unit writes its rent onto the row the trigger made; a room arriving removes that row instead. */
export const units = publicTable(
  'units',
  ({ household, properties }) =>
    properties.flatMap(({ key }) =>
      UNIT_SEEDS[key].map((seed, index) => ({
        id: unitId(household, key, seed, index),
        household_id: householdId(household),
        property_id: propertyId(household, key),
        label: seed.label,
        kind: seed.kind,
        area_m2: seed.area_m2,
        list_rent_vnd: seed.list_rent_vnd,
        available_from: seed.available_from,
        sort_order: index,
      })),
    ),
  { upsert: true },
);
