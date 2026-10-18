import type { Result } from '../result';
import { parseDecimal, toWholeDong } from './decimal';

/** Reads `5`, `5,5` or `2.25` as basis points; more than two decimals, zero or above 100% is refused. */
export function parsePercentBps(text: string): Result<number, 'invalid'> {
  const decimal = parseDecimal(text.trim().replace(/\s*%$/, ''));
  if (decimal === null) return { ok: false, reason: 'invalid' };
  const bps = toWholeDong(decimal, 100n);
  if (!bps.ok || bps.value < 1n || bps.value > 10_000n) return { ok: false, reason: 'invalid' };
  return { ok: true, value: Number(bps.value) };
}
