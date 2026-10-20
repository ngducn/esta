import { seedId } from '../../supabase/seed/generator/ids.ts';

/** Seeded lane rows by their stable seed keys (supabase/seed/README.md). */
export const laneHousehold = (lane: number) => seedId(`seed:household:lane-${lane}`);
export const laneProperty = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
export const laneLease = (lane: number, key: string, unit: number) => seedId(`seed:lease:lane-${lane}:${key}:${unit}`);
export const laneLeasePath = (lane: number, key: string, unit: number) => `/properties/${laneProperty(lane, key)}/rental/leases/${laneLease(lane, key, unit)}`;
/** A lane's invoice for one unit's period, keyed by the period's first day. */
export const laneInvoice = (lane: number, key: string, unit: number, start: string) => seedId(`seed:invoice:lane-${lane}:${key}:${unit}:${start}`);
