import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const readingsInputSchema = z.strictObject({
  property_id: idSchema,
  reading_month: isoDateSchema.refine((date) => date.endsWith('-01')),
  readings: z
    .array(z.strictObject({ meter_id: idSchema, reading: z.number().int().min(0).max(999_999_999) }))
    .min(1)
    .max(500)
    .refine((readings) => new Set(readings.map((entry) => entry.meter_id)).size === readings.length),
});
type Readings = z.output<typeof readingsInputSchema>;

/**
 * How many readings changed, how many bills went out because their rooms are now read, and how many months' use no bill
 * will carry because the room's lease has ended (LSE-4).
 */
export type ReadingsSaved = { readonly saved: number; readonly issued: number; readonly unbilled: number };
export type MeterRefusal = { readonly kind: 'below_previous' | 'above_next' | 'use_too_large' | 'month_after_today' };

const SENTINELS: Readonly<Record<string, MeterRefusal | CommonRefusal>> = {
  ESTA_PROPERTY_NOT_FOUND: { kind: 'not_found' },
  ESTA_READING_MONTH: { kind: 'month_after_today' },
  ESTA_READING_INVALID: { kind: 'invalid', issues: [{ path: 'readings', code: 'invalid_type' }] },
  ESTA_READING_METER: { kind: 'invalid', issues: [{ path: 'readings', code: 'invalid_value' }] },
  ESTA_READING_BELOW_PREVIOUS: { kind: 'below_previous' },
  ESTA_READING_ABOVE_NEXT: { kind: 'above_next' },
  ESTA_READING_USE_TOO_LARGE: { kind: 'use_too_large' },
};

async function storedReadings(ctx: OpContext, { reading_month, readings }: Readings): Promise<ReadonlyMap<string, number>> {
  const { data, error } = await ctx.db
    .from('meter_readings')
    .select('meter_id, reading')
    .eq('household_id', ctx.householdId)
    .eq('reading_month', reading_month)
    .in(
      'meter_id',
      readings.map((entry) => entry.meter_id),
    );
  if (error) throw new Error(`Reading the meter readings failed: ${error.message}`);
  return new Map(data.map((row) => [row.meter_id, row.reading]));
}

/**
 * LSE-4 `Lưu` on the meter screen: one month's readings for meters of one property. `save_meter_readings` stores them
 * on the database clock's date and re-plans the owner-metered leases of those rooms, so a room read in full issues its
 * next bill. Readings that match what is stored plan as unchanged.
 */
export const meterReadingsSave = defineOp<Readings, Readings, ReadingsSaved, MeterRefusal>({
  creates: null,
  input: readingsInputSchema,
  async plan(ctx, input) {
    const stored = await storedReadings(ctx, input);
    return input.readings.every((entry) => stored.get(entry.meter_id) === entry.reading) ? unchanged({ saved: 0, issued: 0, unbilled: 0 }) : change(input);
  },
  async apply(ctx, { property_id, reading_month, readings }) {
    const { data, error } = await ctx.db.rpc('save_meter_readings', { p_property_id: property_id, p_reading_month: reading_month, p_readings: readings });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    const [row] = data;
    return { ok: true, value: { saved: row?.saved ?? 0, issued: row?.issued ?? 0, unbilled: row?.unbilled ?? 0 } };
  },
});
