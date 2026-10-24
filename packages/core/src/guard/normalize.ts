import { daysInMonth } from '../date/iso-date';
import type { Decimal } from '../parse/decimal';

/**
 * A number as a reader takes it, whatever way it was written. Percent and basis points are both `ratio`, so `6,5%`
 * equals `650 bp`. A count is the exact decimal as written, so `0901234567` keeps its zero and no digit past 2^53 is
 * lost. A date is `YYYY-MM-DD`, or a part of one a reader places in context: `--MM-DD` (`7/10`), `YYYY-MM`
 * (`10/2026`), `--MM` (`tháng 10`) or `YYYY` (`năm 2026`).
 */
export type CanonicalNumber =
  | { readonly kind: 'amount'; readonly vnd: bigint }
  | { readonly kind: 'ratio'; readonly bp: bigint }
  | { readonly kind: 'date'; readonly iso: string }
  | { readonly kind: 'count'; readonly value: string };

export function countOf(decimal: Decimal, digitsWritten: number, sign: '' | '-'): CanonicalNumber {
  const padded = decimal.digits.toString().padStart(Math.max(digitsWritten, decimal.scale + 1), '0');
  const integer = padded.slice(0, padded.length - decimal.scale);
  const fraction = padded.slice(padded.length - decimal.scale).replace(/0+$/, '');
  return { kind: 'count', value: `${sign}${integer}${fraction === '' ? '' : `.${fraction}`}` };
}

export function canonicalDate(year: number | null, month: number | null, day: number | null): CanonicalNumber | null {
  const yyyy = year === null ? '-' : String(year).padStart(4, '0');
  if (month === null) return year === null ? null : { kind: 'date', iso: yyyy };
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  if (day === null) return { kind: 'date', iso: `${yyyy}-${mm}` };
  if (day < 1 || day > daysInMonth(year ?? 2024, month)) return null;
  return { kind: 'date', iso: `${yyyy}-${mm}-${String(day).padStart(2, '0')}` };
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

function unsigned(number: CanonicalNumber): CanonicalNumber | null {
  if (number.kind === 'amount' && number.vnd < 0n) return { kind: 'amount', vnd: -number.vnd };
  if (number.kind === 'ratio' && number.bp < 0n) return { kind: 'ratio', bp: -number.bp };
  if (number.kind === 'count' && number.value.startsWith('-')) return { kind: 'count', value: number.value.slice(1) };
  return null;
}

function dateKeys(iso: string): string[] {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (full !== null) return [iso, `--${full[2]}-${full[3]}`, `${full[1]}-${full[2]}`, `--${full[2]}`, `${full[1]}`];
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(iso);
  if (yearMonth !== null) return [iso, `--${yearMonth[2]}`, `${yearMonth[1]}`];
  const monthDay = /^--(\d{2})-\d{2}$/.exec(iso);
  return monthDay === null ? [iso] : [iso, `--${monthDay[1]}`];
}

/**
 * The keys an allowed value satisfies. An amount also satisfies the bare count a reader sees in `3.480.000`, and a
 * negative value also satisfies its unsigned magnitude, while a written minus sign looks up only a negative value.
 */
export function indexKeys(number: CanonicalNumber): string[] {
  if (number.kind === 'date') return dateKeys(number.iso).map((iso) => `date:${iso}`);
  const magnitude = unsigned(number);
  const own = number.kind === 'amount' ? [lookupKey(number), `count:${number.vnd}`] : [lookupKey(number)];
  return magnitude === null ? own : [...own, ...indexKeys(magnitude)];
}
