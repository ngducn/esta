import { vnd, type Vnd } from '../money/vnd';
import type { Result } from '../result';
import { foldVietnamese } from '../search/fold';
import { parseDecimal, toSafeNumber, toWholeDong, type AmountReason, type Decimal } from './decimal';

export type VndInputReason = AmountReason | 'ambiguous_separators' | 'ambiguous_shorthand';

const UNITS: Readonly<Record<string, bigint>> = {
  ty: 1_000_000_000n,
  ti: 1_000_000_000n,
  trieu: 1_000_000n,
  tr: 1_000_000n,
  nghin: 1_000n,
  ngan: 1_000n,
  k: 1_000n,
};

const HALF = 'ruoi';
const CURRENCY_SUFFIX = /\s*(?:₫|đ|d|dong|vnd)$/;
const SPACE_GROUPED = /(\d)\s+(?=\d{3}(?!\d))/g;
const TOKEN = /\d+(?:[.,]\d+)*|[a-z]+|\S/g;

const LONE_DECIMAL_COMMA = /^(\d+),(\d+)$/;
const DOT_GROUPED_COMMA_DECIMAL = /^\d{1,3}(?:\.\d{3})+,\d+$/;

const invalid = { ok: false, reason: 'invalid' } as const;

function parseCommaAsDecimalMark(text: string): Decimal | null {
  const match = LONE_DECIMAL_COMMA.exec(text);
  if (match === null) return parseDecimal(text);
  const [, integer = '', fraction = ''] = match;
  return { digits: BigInt(integer + fraction), scale: fraction.length };
}

function isAmbiguousMix(token: string, beforeUnit: boolean): boolean {
  const mixed = token.includes('.') && token.includes(',');
  return mixed && !(beforeUnit && DOT_GROUPED_COMMA_DECIMAL.test(token));
}

/**
 * Reads what people type for an amount: `3.500.000`, `850k`, `15 triệu`, `3,5tr`, and the
 * spoken shorthand `3tr5` or `1ty2`, where bare digits after the last unit are its decimals.
 * Mixed separators read only as `1.500,5tr`.
 */
export function parseVndInput(text: string): Result<Vnd, VndInputReason> {
  const folded = foldVietnamese(text).trim().replace(CURRENCY_SUFFIX, '').replace(SPACE_GROUPED, '$1');
  if (folded === '') return { ok: false, reason: 'empty' };
  const tokens = folded.match(TOKEN) ?? [];

  let total = 0n;
  let last: { unit: bigint; scale: number } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const unit = tokens[i + 1] === undefined ? undefined : UNITS[tokens[i + 1] ?? ''];

    if (last !== undefined && i === tokens.length - 1 && (token === HALF || /^\d{1,3}$/.test(token))) {
      if (last.scale > 0) return { ok: false, reason: 'ambiguous_shorthand' };
      const fraction = token === HALF ? { digits: 5n, scale: 1 } : { digits: BigInt(token), scale: token.length };
      const part = toWholeDong(fraction, last.unit);
      if (!part.ok) return part;
      total += part.value;
      break;
    }

    if (isAmbiguousMix(token, unit !== undefined)) return { ok: false, reason: 'ambiguous_separators' };
    const amount = unit === undefined ? parseDecimal(token) : parseCommaAsDecimalMark(token);
    if (amount === null) return invalid;
    if (unit === undefined) {
      if (tokens.length !== 1) return invalid;
      const whole = toWholeDong(amount, 1n);
      if (!whole.ok) return whole;
      total = whole.value;
      break;
    }
    if (last !== undefined && unit >= last.unit) return invalid;
    const part = toWholeDong(amount, unit);
    if (!part.ok) return part;
    total += part.value;
    last = { unit, scale: amount.scale };
    i++;
  }

  const safe = toSafeNumber(total);
  return safe.ok ? { ok: true, value: vnd(safe.value) } : safe;
}
