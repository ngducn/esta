import { daysInMonth } from '../date/iso-date';
import type { Locale } from '../format';

/**
 * A number as a reader takes it, whatever way it was written. Percent and basis points are both `ratio`, so `6,5%`
 * equals `650 bp`. A date is `YYYY-MM-DD`, or a part of one a reader places in context: `--MM-DD` (`7/10`),
 * `YYYY-MM` (`10/2026`) or `--MM` (`tháng 10`).
 */
export type CanonicalNumber =
  | { readonly kind: 'amount'; readonly vnd: number }
  | { readonly kind: 'ratio'; readonly bp: number }
  | { readonly kind: 'date'; readonly iso: string }
  | { readonly kind: 'count'; readonly value: number };

/** `units / 10^scale`, kept exact so a decimal times a magnitude is checked as an integer. */
export type Decimal = { readonly units: bigint; readonly scale: number };

const GROUP: Record<Locale, string> = { vi: '.', en: ',' };

/**
 * Reads a numeral as the household's locale writes it. A single separator before exactly three digits is a
 * thousands group in the locale that groups with it and unreadable in the other, because `1,500` is 1,5 to one
 * reader and 1500 to another. Separators that disagree, or groups that are not three digits, are unreadable.
 */
export function readNumeral(text: string, locale: Locale): Decimal | null {
  if (/^\d+$/.test(text)) return { units: BigInt(text), scale: 0 };
  const grouped = /^(\d{1,3}([.,])\d{3}(?:\2\d{3})*)(?:([.,])(\d+))?$/.exec(text);
  if (grouped !== null) {
    const [, integer = '', group = '', decimalMark, fraction = ''] = grouped;
    const groups = integer.split(group).length - 1;
    if (decimalMark === group) return null;
    if (decimalMark === undefined && groups === 1 && group !== GROUP[locale]) return null;
    return { units: BigInt(integer.replaceAll(group, '') + fraction), scale: fraction.length };
  }
  const decimal = /^(\d+)[.,](\d+)$/.exec(text);
  if (decimal === null) return null;
  const [, integer = '', fraction = ''] = decimal;
  if (fraction.length === 3) return null;
  return { units: BigInt(integer + fraction), scale: fraction.length };
}

/** The exact integer `decimal × factor`, or null when it has a fraction left. */
export function times(decimal: Decimal, factor: bigint, divisor = 1n): bigint | null {
  const denominator = 10n ** BigInt(decimal.scale) * divisor;
  const product = decimal.units * factor;
  return product % denominator === 0n ? product / denominator : null;
}

export function toNumber(decimal: Decimal): number {
  return Number(decimal.units) / 10 ** decimal.scale;
}

export function isoFromParts(year: number | null, month: number, day: number | null): string | null {
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  if (day === null) return year === null ? `--${mm}` : `${year}-${mm}`;
  if (day < 1 || day > daysInMonth(year ?? 2024, month)) return null;
  const dd = String(day).padStart(2, '0');
  return year === null ? `--${mm}-${dd}` : `${String(year).padStart(4, '0')}-${mm}-${dd}`;
}

/** The key a written number looks up. */
export function lookupKey(number: CanonicalNumber): string {
  switch (number.kind) {
    case 'amount':
      return `amount:${number.vnd}`;
    case 'ratio':
      return `ratio:${number.bp}`;
    case 'date':
      return `date:${number.iso}`;
    case 'count':
      return `count:${number.value}`;
  }
}

function magnitude(number: CanonicalNumber): CanonicalNumber | null {
  if (number.kind === 'amount' && number.vnd < 0) return { kind: 'amount', vnd: -number.vnd };
  if (number.kind === 'ratio' && number.bp < 0) return { kind: 'ratio', bp: -number.bp };
  if (number.kind === 'count' && number.value < 0) return { kind: 'count', value: -number.value };
  return null;
}

/** A date also allows the parts a reader takes from it. */
function dateKeys(iso: string): string[] {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (full !== null) return [iso, `--${full[2]}-${full[3]}`, `${full[1]}-${full[2]}`, `--${full[2]}`];
  const monthDay = /^--(\d{2})-\d{2}$/.exec(iso);
  if (monthDay !== null) return [iso, `--${monthDay[1]}`];
  const yearMonth = /^\d{4}-(\d{2})$/.exec(iso);
  return yearMonth === null ? [iso] : [iso, `--${yearMonth[1]}`];
}

/**
 * The keys an allowed value satisfies. An amount also satisfies the bare count a reader sees in `3.480.000`, and a
 * negative value also satisfies its unsigned magnitude, while a written minus sign looks up only a negative value.
 */
export function indexKeys(number: CanonicalNumber): string[] {
  const unsigned = magnitude(number);
  const keys = unsigned === null ? [] : indexKeys(unsigned);
  if (number.kind === 'date') return dateKeys(number.iso).map((iso) => `date:${iso}`);
  if (number.kind === 'amount') return [...keys, lookupKey(number), `count:${number.vnd}`];
  return [...keys, lookupKey(number)];
}
