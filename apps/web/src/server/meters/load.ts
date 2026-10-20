import 'server-only';
import { addMonths } from '@esta/core/date/calendar';
import type { IsoDate } from '@esta/core/date';
import { monthlyConsumption } from '@esta/core/meters';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { idSchema } from '@esta/ops';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { loadPropertyRental } from '@/server/properties/rental';
import { createSessionClient } from '@/server/supabase/server';

const METER_KINDS = ['electricity', 'water'] as const;
export type MeterKind = (typeof METER_KINDS)[number];

const meterSchema = z.object({ id: idSchema, unit_id: idSchema, kind: z.enum(METER_KINDS) });
const readingSchema = z.object({ meter_id: idSchema, reading_month: isoDateSchema, reading: z.number().int(), read_on: isoDateSchema });

export type MeterView = {
  readonly id: string;
  readonly kind: MeterKind;
  /** This month's stored reading and the day it was read. */
  readonly stored: { readonly reading: number; readonly readOn: IsoDate } | null;
  /** The latest reading before this month, which this month's must not fall below. */
  readonly previous: { readonly month: IsoDate; readonly reading: number } | null;
  /** Each earlier month's use, oldest first, which the 3× warning compares with (LSE-4). */
  readonly history: readonly number[];
};
export type MeterRoom = { readonly unitId: string; readonly label: string; readonly meters: readonly MeterView[] };

/** How far back the screen reads: six months of use for the warning, plus a gap of a few unread months. */
const HISTORY_MONTHS = 12;

/** Every room with an active meter, in room order, with what the screen shows beside each input for `month`. */
export async function loadMeterEntry(propertyId: string, month: IsoDate): Promise<readonly MeterRoom[]> {
  const [member, supabase, rental] = await Promise.all([requireMember(), createSessionClient(), loadPropertyRental(propertyId)]);
  const meters = await supabase.from('meters').select('id, unit_id, kind').match({ household_id: member.household.id, property_id: propertyId, active: true });
  if (meters.error) throw new Error(`Reading meters failed: ${meters.error.message}`);
  const active = z.array(meterSchema).parse(meters.data);
  const readings = await supabase
    .from('meter_readings')
    .select('meter_id, reading_month, reading, read_on')
    .eq('household_id', member.household.id)
    .in(
      'meter_id',
      active.map((meter) => meter.id),
    )
    .gte('reading_month', addMonths(month, -HISTORY_MONTHS))
    .lte('reading_month', month);
  if (readings.error) throw new Error(`Reading meter readings failed: ${readings.error.message}`);
  const rows = z.array(readingSchema).parse(readings.data);

  const view = (meter: z.output<typeof meterSchema>): MeterView => {
    const mine = rows.filter((row) => row.meter_id === meter.id);
    const stored = mine.find((row) => row.reading_month === month);
    const before = mine.filter((row) => row.reading_month < month).map((row) => ({ month: row.reading_month, reading: row.reading }));
    const previous = before.toSorted((a, b) => b.month.localeCompare(a.month))[0] ?? null;
    return {
      id: meter.id,
      kind: meter.kind,
      stored: stored === undefined ? null : { reading: stored.reading, readOn: stored.read_on },
      previous,
      history: monthlyConsumption(before).map((entry) => entry.used),
    };
  };
  return rental.units.flatMap((unit) => {
    const own = active.filter((meter) => meter.unit_id === unit.id).toSorted((a, b) => METER_KINDS.indexOf(a.kind) - METER_KINDS.indexOf(b.kind));
    return own.length === 0 ? [] : [{ unitId: unit.id, label: unit.label, meters: own.map(view) }];
  });
}

/** Whether the Cho thuê tab offers `Nhập chỉ số`: the property has a meter to read. */
export async function propertyHasMeters(propertyId: string): Promise<boolean> {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: propertyId, active: true };
  const { count, error } = await supabase.from('meters').select('id', { count: 'exact', head: true }).match(scope);
  if (error) throw new Error(`Counting meters failed: ${error.message}`);
  return (count ?? 0) > 0;
}
