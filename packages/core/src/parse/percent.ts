import type { Result } from '../result';

const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?\s*%?$/;

/** Reads `5`, `5,5` or `2.25` as basis points. A percent has no thousands, so `5.000` and `0,001` are refused, as are 0 and above 100%. */
export function parsePercentBps(text: string): Result<number, 'invalid'> {
  const match = PERCENT.exec(text.trim());
  if (match === null) return { ok: false, reason: 'invalid' };
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bps >= 1 && bps <= 10_000 ? { ok: true, value: bps } : { ok: false, reason: 'invalid' };
}
