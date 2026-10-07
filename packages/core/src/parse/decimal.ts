import type { Result } from '../result';

/** An exact decimal: `digits / 10 ** scale`. */
export type Decimal = { digits: bigint; scale: number };

export type AmountReason = 'empty' | 'invalid' | 'fractional' | 'too_large';

const NUMBER = /^\d+(?:[.,]\d+)*$/;

function isThousandsGrouping(groups: readonly string[]): boolean {
  const [first, ...rest] = groups;
  return first !== undefined && first.length <= 3 && rest.every((group) => group.length === 3);
}

/**
 * Reads `1.500.000`, `1,500,000`, `1500000.00`, `3,5` and `1.500.000,50`. A run of one
 * separator followed by three-digit groups is thousands grouping; otherwise the last
 * separator is the decimal point. Đồng have no minor unit, so `3.500` is 3500, never 3.5.
 */
export function parseDecimal(text: string): Decimal | null {
  if (!NUMBER.test(text)) return null;
  const separators = text.replace(/\d/g, '');
  const groups = text.split(/[.,]/);
  if (separators === '') return { digits: BigInt(text), scale: 0 };

  const uniform = new Set(separators).size === 1;
  if (uniform && isThousandsGrouping(groups)) return { digits: BigInt(groups.join('')), scale: 0 };

  const integerGroups = groups.slice(0, -1);
  const fraction = groups.at(-1) ?? '';
  const groupSeparators = separators.slice(0, -1);
  const decimalSeparator = separators.at(-1);
  const integerValid =
    groupSeparators === '' ||
    (new Set(groupSeparators).size === 1 &&
      !groupSeparators.includes(decimalSeparator ?? '') &&
      isThousandsGrouping(integerGroups));
  if (!integerValid) return null;
  return { digits: BigInt(integerGroups.join('') + fraction), scale: fraction.length };
}

export function toWholeDong(decimal: Decimal, multiplier: bigint): Result<bigint, AmountReason> {
  const divisor = 10n ** BigInt(decimal.scale);
  const scaled = decimal.digits * multiplier;
  if (scaled % divisor !== 0n) return { ok: false, reason: 'fractional' };
  return { ok: true, value: scaled / divisor };
}

export function toSafeNumber(value: bigint): Result<number, AmountReason> {
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > limit || value < -limit) return { ok: false, reason: 'too_large' };
  return { ok: true, value: Number(value) };
}
