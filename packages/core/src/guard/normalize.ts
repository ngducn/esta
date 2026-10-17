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
      return [`code:${memoless(value.code)}`, ...[...value.code.matchAll(MEMO)].map(([, memo = '']) => `code:${memo}`)];
  }
}

/** A bank keeps `ESTA7K2QX9MP` glued inside its own references (DOMAIN-VN §9), so a code is compared without the prefix. */
const MEMO = /ESTA([A-Z0-9]{8})/gu;
const memoless = (code: string): string => (code.startsWith('ESTA') && code.length > 4 ? code.slice(4) : code);

/**
 * The same value with the other sign, which an unsigned claim also matches: prose carries the direction
 * in words such as chi, lỗ or giảm, so `chi 1.500.000 ₫` states the run's -1500000.
 */
export function negated(value: CanonicalNumber): CanonicalNumber | null {
  switch (value.kind) {
    case 'amount':
    case 'compact':
      return value.vnd === 0 ? null : { ...value, vnd: -value.vnd };
    case 'ratio':
      return value.bp === 0 ? null : { ...value, bp: -value.bp };
    case 'area':
      return value.m2 === 0 ? null : { ...value, m2: -value.m2 };
    case 'count':
      return value.value === 0 ? null : { ...value, value: -value.value };
    default:
      return null;
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
    case 'count':
      return [`n:${claim.value}`];
    case 'code':
      return [`code:${memoless(claim.code)}`];
  }
}

/** The compact keys one step either side of a compact claim, for the rounding diagnosis. */
export function neighbourKeys(claim: CanonicalNumber): readonly string[] {
  if (claim.kind !== 'compact') return [];
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

/** What may sit between two digits of one numeral. Each is a single character; only `.`, `,` and a repeated space character group digits. */
export const JOINER = String.raw`[.,'’·_\p{Zs}\t\p{Pc}\p{Cf}]`;

const SPACE_GROUPED = /^(\d{1,3}([\p{Zs}\t])\d{3}(?:\2\d{3})*)(?:[.,](\d{1,2}))?$/u;
const SPACE = /[\p{Zs}\t]/gu;

/**
 * The numeral grammar. `1.500.000`, `1,500` and `3,5` read as parseDecimal reads them; `5 000 000` and `5 000 000,50`
 * are three-digit groups joined by one space character used throughout. Anything else, such as `5 000.000`, `5'000`
 * or `50 00 000`, reads as nothing.
 */
export function parseNumeral(text: string): Decimal | null {
  const grouped = SPACE_GROUPED.exec(text);
  if (grouped === null) return parseDecimal(text);
  const [, integer = '', , fraction = ''] = grouped;
  return { digits: BigInt(integer.replace(SPACE, '') + fraction), scale: fraction.length };
}

export function readAmount(digits: string, sign: 1 | -1): ExtractedValue {
  const decimal = parseNumeral(digits);
  const vnd = decimal === null ? null : wholeNumber(decimal, 1n, sign);
  return vnd === null ? invalid : { kind: 'amount', vnd };
}

/** One numeral times one unit size: `3,5` of a million, or the `5` of `3 triệu 5`, a tenth of the last unit. */
export type CompactPart = { readonly numeral: Decimal; readonly size: bigint };

export const unitSize = (unit: CompactUnit): bigint => BigInt(COMPACT_RULES[unit].size);

/** A compact amount such as `1 tỷ 250 triệu` or `3 triệu rưỡi` is the sum of its parts, compared at the precision of its smallest unit. */
export function readCompact(parts: readonly CompactPart[], sign: 1 | -1, unit: CompactUnit): ExtractedValue {
  let total = 0n;
  for (const { numeral, size } of parts) {
    const whole = toWholeDong(numeral, size);
    if (!whole.ok) return invalid;
    total += whole.value;
  }
  const safe = toSafeNumber(total * BigInt(sign));
  return safe.ok ? { kind: 'compact', vnd: safe.value, unit } : invalid;
}

export function readRatio(digits: string, sign: 1 | -1, bpPerUnit: bigint): ExtractedValue {
  const decimal = parseNumeral(digits);
  const bp = decimal === null ? null : wholeNumber(decimal, bpPerUnit, sign);
  return bp === null ? invalid : { kind: 'ratio', bp };
}

/** Every form follows the numeral grammar: `1.500` and `1,500` are both 1500, `3,5` and `3.5` are 3.5. */
function toNumber(digits: string, sign: 1 | -1): number | null {
  const decimal = parseNumeral(digits);
  if (decimal === null) return null;
  const integer = toSafeNumber(decimal.digits);
  if (!integer.ok) return null;
  const magnitude = integer.value / 10 ** decimal.scale;
  return magnitude === 0 ? 0 : sign * magnitude;
}

export function readArea(digits: string, sign: 1 | -1): ExtractedValue {
  const m2 = toNumber(digits, sign);
  return m2 === null ? invalid : { kind: 'area', m2 };
}

export function readCount(digits: string, sign: 1 | -1): ExtractedValue {
  const value = toNumber(digits, sign);
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
