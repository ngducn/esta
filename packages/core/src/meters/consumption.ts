import type { Result } from '../result';

/**
 * What a meter used between two readings (LSE-4). A meter only counts up, so a reading below the one before it is
 * refused, as `private.guard_meter_reading` refuses it on save; a replaced meter is a new meter.
 */
export function consumption(previous: number, current: number): Result<number, 'below_previous'> {
  return current < previous ? { ok: false, reason: 'below_previous' } : { ok: true, value: current - previous };
}

