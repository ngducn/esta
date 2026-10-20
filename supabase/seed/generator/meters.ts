import type { Instant } from '../../../packages/core/src/index.ts';
import { publicTable, type HouseholdSeed, type SeedContext } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import { propertyId, unitId, UNIT_SEEDS } from './units.ts';

type MeterKind = 'electricity' | 'water';

/** [app rule] What a rooming house commonly charges per kWh and per m³ (DOMAIN-VN §7). */
const PRICE_VND: Record<MeterKind, number> = { electricity: 3_500, water: 18_000 };

/** SPEC §9.3: every Dĩ An room's September readings, each its meter's first, so October's bills carry no consumption. */
const SEPTEMBER: Record<MeterKind, readonly number[]> = {
  electricity: [2_847, 4_120, 1_563, 3_305, 2_208, 5_671, 3_984, 812],
  water: [312, 405, 188, 267, 233, 451, 376, 95],
};

export const METER_ENTRY = { property: 'di-an', readingMonth: '2026-09-01', readOn: '2026-10-03' } as const;

const KINDS: readonly MeterKind[] = ['electricity', 'water'];

function diAnMeters(household: HouseholdSeed, { properties }: Pick<SeedContext, 'properties'>) {
  if (!properties.some((property) => property.key === METER_ENTRY.property)) return [];
  return UNIT_SEEDS[METER_ENTRY.property].flatMap((unit, index) =>
    KINDS.map((kind) => ({ id: seedId(`seed:meter:${household.key}:${METER_ENTRY.property}:${index + 1}:${kind}`), unit, index, kind })),
  );
}

export const meters = publicTable('meters', (ctx) =>
  diAnMeters(ctx.household, ctx).map(({ id, unit, index, kind }) => ({
    id,
    household_id: householdId(ctx.household),
    property_id: propertyId(ctx.household, METER_ENTRY.property),
    unit_id: unitId(ctx.household, METER_ENTRY.property, unit, index),
    kind,
    pricing: { kind: 'flat', unit_price_vnd: PRICE_VND[kind] },
    serial: null,
    active: true,
  })),
);

/**
 * The September readings as one insert, which `billingSql` runs on the night of 2026-10-03 before that night's
 * invoicing, so the run that night finds Dĩ An's readings complete and issues its October drafts (LSE-4).
 */
export function septemberReadingsSql(households: readonly HouseholdSeed[], ctx: Pick<SeedContext, 'properties'>, stamp: Instant): string {
  const rows = households.flatMap((household) =>
    diAnMeters(household, ctx).map(({ id, index, kind }) => {
      const reading = SEPTEMBER[kind][index];
      if (reading === undefined) throw new Error(`No September ${kind} reading for room ${index + 1}`);
      const values = [seedId(`seed:meter-reading:${household.key}:${METER_ENTRY.property}:${index + 1}:${kind}:${METER_ENTRY.readingMonth}`), householdId(household), id];
      return `(${values.map((value) => `'${value}'`).join(', ')}, '${METER_ENTRY.readingMonth}', ${reading}, '${METER_ENTRY.readOn}', '${stamp}', '${stamp}')`;
    }),
  );
  if (rows.length === 0) return '';
  return `insert into public.meter_readings (id, household_id, meter_id, reading_month, reading, read_on, created_at, updated_at) values
      ${rows.join(',\n      ')};`;
}
