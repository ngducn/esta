import { isIsoDate, type IsoDate } from '../date/iso-date';
import { parseDecimal, toSafeNumber, toWholeDong, type Decimal } from '../parse/decimal';

export type CompactUnit = 'ty' | 'tr' | 'nghin';

export type CompactRule = { readonly size: number; readonly step: number };

/**
 * The tolerance table. A compact claim in a unit matches an amount when the amount rounded to the
 * unit's step equals the claim and is at least one whole unit: the rounding formatVndCompact
 * applies (DOMAIN-VN §9), so `3,5 tr` covers 3.450.000 to 3.549.999 and nothing else.
 */
export const COMPACT_RULES: Readonly<Record<CompactUnit, CompactRule>> = {
  ty: { size: 1_000_000_000, step: 10_000_000 },
  tr: { size: 1_000_000, step: 100_000 },
  nghin: { size: 1_000, step: 1_000 },
};

const COMPACT_UNITS: readonly CompactUnit[] = ['ty', 'tr', 'nghin'];

export type CanonicalNumber =
  | { readonly kind: 'amount'; readonly vnd: number }
  | { readonly kind: 'compact'; readonly vnd: number; readonly unit: CompactUnit }
  | { readonly kind: 'ratio'; readonly bp: number }
  | { readonly kind: 'date'; readonly iso: IsoDate }
  | { readonly kind: 'dayMonth'; readonly month: number; readonly day: number }
  | { readonly kind: 'monthYear'; readonly year: number; readonly month: number }
  | { readonly kind: 'month'; readonly month: number }
  | { readonly kind: 'year'; readonly year: number }
  | { readonly kind: 'time'; readonly hhmm: string }
  | { readonly kind: 'area'; readonly m2: number }
  | { readonly kind: 'count'; readonly value: number }
  | { readonly kind: 'code'; readonly code: string };

/** A number the guard could not read, such as `1.500.00 ₫` or `3,5 ₫`. It can never match. */
export type ExtractedValue = CanonicalNumber | { readonly kind: 'invalid' };

const YEAR_RANGE = { min: 1900, max: 2199 };

export function roundToUnit(vnd: number, rule: CompactRule): number | null {
  const rounded = Math.round(Math.abs(vnd) / rule.step) * rule.step;
  return rounded < rule.size ? null : Math.sign(vnd) * rounded;
}

function compactKeys(vnd: number): string[] {
  const keys: string[] = [];
  for (const unit of COMPACT_UNITS) {
    const rounded = roundToUnit(vnd, COMPACT_RULES[unit]);
    if (rounded !== null) keys.push(`c:${unit}:${rounded}`);
  }
  return keys;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function indexKeys(value: CanonicalNumber): readonly string[] {
  switch (value.kind) {
    case 'amount':
      return [`n:${value.vnd}`, ...compactKeys(value.vnd)];
    case 'compact':
      return [`c:${value.unit}:${value.vnd}`];
    case 'ratio':
      return [`bp:${value.bp}`];
    case 'date':
      return [
        `d:${value.iso}`,
        `dm:${value.iso.slice(5)}`,
        `my:${value.iso.slice(0, 7)}`,
        `m:${value.iso.slice(5, 7)}`,
        `y:${value.iso.slice(0, 4)}`,
      ];
    case 'dayMonth':
      return [`dm:${pad(value.month)}-${pad(value.day)}`];
    case 'monthYear':
      return [`my:${value.year}-${pad(value.month)}`, `m:${pad(value.month)}`, `y:${value.year}`];
    case 'month':
      return [`m:${pad(value.month)}`];
    case 'year':
      return [`y:${value.year}`];
    case 'time':
      return [`t:${value.hhmm}`];
    case 'area':
      return [`a:${value.m2}`, `n:${value.m2}`];
    case 'count':
      return [`n:${value.value}`, ...(Number.isInteger(value.value) ? compactKeys(value.value) : [])];
    case 'code':
      return [`code:${value.code}`];
  }
}

/** The keys a claim looks up, in preference order. */
export function lookupKeys(claim: CanonicalNumber): readonly string[] {
  switch (claim.kind) {
    case 'amount':
      return [`n:${claim.vnd}`];
    case 'compact':
      return [`c:${claim.unit}:${claim.vnd}`, `n:${claim.vnd}`];
    case 'ratio':
      return [`bp:${claim.bp}`];
    case 'date':
      return [`d:${claim.iso}`];
    case 'dayMonth':
      return [`dm:${pad(claim.month)}-${pad(claim.day)}`];
    case 'monthYear':
      return [`my:${claim.year}-${pad(claim.month)}`];
    case 'month':
      return [`m:${pad(claim.month)}`];
    case 'year':
      return [`y:${claim.year}`, `n:${claim.year}`];
    case 'time':
      return [`t:${claim.hhmm}`];
    case 'area':
      return [`a:${claim.m2}`, `n:${claim.m2}`];
    case 'count': {
      const yearish = Number.isInteger(claim.value) && claim.value >= YEAR_RANGE.min && claim.value <= YEAR_RANGE.max;
      return yearish ? [`n:${claim.value}`, `y:${claim.value}`] : [`n:${claim.value}`];
    }
    case 'code':
      return [`code:${claim.code}`];
  }
}

/** The compact keys one step either side of a compact claim, for the rounding diagnosis. */
export function neighbourKeys(claim: { readonly vnd: number; readonly unit: CompactUnit }): readonly string[] {
  const { step } = COMPACT_RULES[claim.unit];
  return [`c:${claim.unit}:${claim.vnd - step}`, `c:${claim.unit}:${claim.vnd + step}`];
}

function wholeNumber(decimal: Decimal, multiplier: bigint, sign: 1 | -1): number | null {
  const whole = toWholeDong(decimal, multiplier);
  if (!whole.ok) return null;
  const safe = toSafeNumber(whole.value * BigInt(sign));
  return safe.ok ? safe.value : null;
}

const invalid: ExtractedValue = { kind: 'invalid' };

const GROUP_SPACE = /[ \u00A0\u202F\u2009]/gu;
const decimalOf = (digits: string): Decimal | null => parseDecimal(digits.replace(GROUP_SPACE, ''));

export function readAmount(digits: string, sign: 1 | -1): ExtractedValue {
  const decimal = decimalOf(digits);
  const vnd = decimal === null ? null : wholeNumber(decimal, 1n, sign);
  return vnd === null ? invalid : { kind: 'amount', vnd };
}

export function readCompact(digits: string, sign: 1 | -1, unit: CompactUnit): ExtractedValue {
  const decimal = decimalOf(digits);
  const vnd = decimal === null ? null : wholeNumber(decimal, BigInt(COMPACT_RULES[unit].size), sign);
  return vnd === null ? invalid : { kind: 'compact', vnd, unit };
}

/** The spoken shorthand `3tr5` (parseVndInput): the digits after the unit are its decimals, so `12tr500` is 12,5 tr. */
export function readShorthand(whole: string, fraction: string, unit: CompactUnit): ExtractedValue {
  const decimal = { digits: BigInt(whole + fraction), scale: fraction.length };
  const vnd = wholeNumber(decimal, BigInt(COMPACT_RULES[unit].size), 1);
  return vnd === null ? invalid : { kind: 'compact', vnd, unit };
}

export function readRatio(digits: string, bpPerUnit: bigint): ExtractedValue {
  const decimal = decimalOf(digits);
  const bp = decimal === null ? null : wholeNumber(decimal, bpPerUnit, 1);
  return bp === null ? invalid : { kind: 'ratio', bp };
}

/** Every form follows parseDecimal's grouping rule: `1.500` and `1,500` are both 1500, `3,5` and `3.5` are 3.5. */
function toNumber(digits: string): number | null {
  const decimal = decimalOf(digits);
  if (decimal === null) return null;
  const integer = toSafeNumber(decimal.digits);
  return integer.ok ? integer.value / 10 ** decimal.scale : null;
}

export function readArea(digits: string): ExtractedValue {
  const m2 = toNumber(digits);
  return m2 === null ? invalid : { kind: 'area', m2 };
}

export function readCount(digits: string): ExtractedValue {
  const value = toNumber(digits);
  return value === null ? invalid : { kind: 'count', value };
}

export function readDate(year: string, month: string, day: string): ExtractedValue {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(iso) ? { kind: 'date', iso } : invalid;
}

const inRange = (text: string, min: number, max: number): number | null => {
  const n = Number(text);
  return n >= min && n <= max ? n : null;
};

export function readDayMonth(day: string, month: string): ExtractedValue {
  const d = inRange(day, 1, 31);
  const m = inRange(month, 1, 12);
  return d === null || m === null ? invalid : { kind: 'dayMonth', month: m, day: d };
}

export function readMonthYear(month: string, year: string): ExtractedValue {
  const m = inRange(month, 1, 12);
  const y = inRange(year, YEAR_RANGE.min, YEAR_RANGE.max);
  return m === null || y === null ? invalid : { kind: 'monthYear', year: y, month: m };
}

export function readMonth(month: string): ExtractedValue {
  const m = inRange(month, 1, 12);
  return m === null ? invalid : { kind: 'month', month: m };
}

export function readYear(year: string): ExtractedValue {
  const y = inRange(year, YEAR_RANGE.min, YEAR_RANGE.max);
  return y === null ? invalid : { kind: 'year', year: y };
}

export function readTime(hour: string, minute: string): ExtractedValue {
  const h = inRange(hour, 0, 23);
  const m = inRange(minute, 0, 59);
  return h === null || m === null ? invalid : { kind: 'time', hhmm: `${pad(h)}:${pad(m)}` };
}
