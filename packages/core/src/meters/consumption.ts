import type { Result } from '../result';

/**
 * What a meter used between two readings (LSE-4). A meter only counts up, so a reading below the one before it is
 * refused, as `private.guard_meter_reading` refuses it on save; a replaced meter is a new meter.
 */
export function consumption(previous: number, current: number): Result<number, 'below_previous'> {
  return current < previous ? { ok: false, reason: 'below_previous' } : { ok: true, value: current - previous };
}

export type MonthReading = { readonly month: string; readonly reading: number };

/** Each month's consumption from a meter's readings, oldest first: a reading less the one before it. */
export function monthlyConsumption(readings: readonly MonthReading[]): readonly { readonly month: string; readonly used: number }[] {
  const sorted = [...readings].sort((a, b) => a.month.localeCompare(b.month));
  return sorted.slice(1).flatMap((reading, index) => {
    const used = consumption(sorted[index]?.reading ?? reading.reading, reading.reading);
    return used.ok ? [{ month: reading.month, used: used.value }] : [];
  });
}
