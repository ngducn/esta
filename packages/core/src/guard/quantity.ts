import type { Locale } from '../format';
import { parseLocaleNumeral, toWholeDong, type Decimal } from '../parse/decimal';
import { countOf, type CanonicalNumber } from './normalize';
import { has, nextJoins, magnitudeWithCurrency, meaningOf, meaningsOf, PER, type Meaning, type Token } from './words';

export type Units =
  | { readonly kind: 'count' }
  | { readonly kind: 'measure' }
  | { readonly kind: 'amount'; readonly factor: bigint }
  | { readonly kind: 'ratio'; readonly bp: bigint };

export type Quantity = {
  readonly last: number;
  readonly numeral: Decimal;
  readonly digitsWritten: number;
  readonly sign: '' | '-';
  readonly units: Units;
  readonly afterMagnitude: bigint;
};

export const COUNT: Units = { kind: 'count' };
export const digitCount = (text: string) => text.replace(/\D/gu, '').length;

function unitsOf(meanings: readonly Meaning[]): Units | null {
  for (const meaning of meanings) {
    if (meaning.kind === 'magnitude') return { kind: 'amount', factor: meaning.factor };
    if (meaning.kind === 'currency') return { kind: 'amount', factor: 1n };
    if (meaning.kind === 'ratio') return { kind: 'ratio', bp: meaning.bp };
    if (meaning.kind === 'measure') return { kind: 'measure' };
  }
  return null;
}

const isCurrency = (meanings: readonly Meaning[]) => meanings.some((meaning) => meaning.kind === 'currency');

const changesNumber = (token: Token) => unitsOf(token.meanings) !== null || has(token, 'unreadable') || has(token, 'half');

function gluedUnits(suffix: string): { readonly units: Units; readonly acceptsTail: boolean } | null {
  const word = suffix.replace(PER, '');
  if (word === '') return { units: COUNT, acceptsTail: suffix === '' };
  const whole = unitsOf(meaningsOf(word));
  if (whole !== null) return { units: whole, acceptsTail: whole.kind === 'amount' && whole.factor > 1n };
  const factor = magnitudeWithCurrency(word);
  return factor === null ? null : { units: { kind: 'amount', factor }, acceptsTail: false };
}

function spaceGroups(tokens: readonly Token[], at: number, digits: string): { last: number; digits: string; suffix: string } {
  let last = at;
  let joined = digits;
  let suffix = '';
  while (suffix === '' && /^\d{1,3}$/u.test(digits) && nextJoins(tokens, last)) {
    const group = /^(\d{3})(\D.*)?$/u.exec(tokens[last + 1]?.body ?? '');
    if (group === null) break;
    joined += group[1];
    suffix = group[2] ?? '';
    last += 1;
  }
  return { last, digits: joined, suffix };
}

function wordUnits(tokens: readonly Token[], at: number): { units: Units; acceptsTail: boolean; last: number } | null {
  const pair = nextJoins(tokens, at) ? unitsOf(meaningsOf(`${tokens[at]?.body} ${tokens[at + 1]?.body}`)) : null;
  if (pair !== null) return { units: pair, acceptsTail: false, last: at + 1 };
  const token = tokens[at];
  const single = token === undefined || token.hasDigit ? null : gluedUnits(token.body);
  return single === null || single.units.kind === 'count' ? null : { ...single, last: at };
}

function readTail(tokens: readonly Token[], at: number, numeral: Decimal, factor: bigint) {
  const plain = { last: at, factor, afterMagnitude: 0n, currencyMayFollow: true };
  const next = nextJoins(tokens, at) ? tokens[at + 1] : undefined;
  if (factor === 100n) {
    const stacked = meaningOf(next, 'magnitude');
    return stacked !== undefined && stacked.factor >= 1_000n ? { ...plain, last: at + 1, factor: 100n * stacked.factor } : null;
  }
  if (next === undefined || numeral.scale !== 0) return plain;
  if (has(next, 'half')) return { ...plain, last: at + 1, afterMagnitude: factor / 2n };
  if (/^\d$/u.test(next.body)) return { last: at + 1, factor, afterMagnitude: (BigInt(next.body) * factor) / 10n, currencyMayFollow: false };
  if (!/^\d{3}$/u.test(next.body) || factor < 1_000_000n) return plain;
  const lower = factor / 1_000n;
  const named = nextJoins(tokens, at + 1) && meaningOf(tokens[at + 2], 'magnitude')?.factor === lower;
  return { last: named ? at + 2 : at + 1, factor, afterMagnitude: BigInt(next.body) * lower, currencyMayFollow: named };
}

function halfTokens(tokens: readonly Token[], at: number): number {
  if (!nextJoins(tokens, at)) return 0;
  const next = tokens[at + 1];
  if (has(next, 'half')) return 1;
  const word = next !== undefined && /\p{L}/u.test(next.body) && !next.hasDigit && !changesNumber(next);
  return word && nextJoins(tokens, at + 1) && has(tokens[at + 2], 'half') ? 2 : 0;
}

export function readQuantity(tokens: readonly Token[], at: number, locale: Locale, core = tokens[at]?.core ?? ''): Quantity | null {
  const token = tokens[at];
  const match = /^(\d[\d.,]*)(.*)$/u.exec(core);
  if (token === undefined || match === null) return null;
  const spaced = match[2] === '' ? spaceGroups(tokens, at, match[1] ?? '') : { last: at, digits: match[1] ?? '', suffix: match[2] ?? '' };
  const numeral = parseLocaleNumeral(spaced.digits, locale);
  const glued = gluedUnits(spaced.suffix);
  if (numeral === null || glued === null) return null;
  let { last } = spaced;
  let { units } = glued;
  let { acceptsTail } = glued;
  let afterMagnitude = 0n;
  const word = acceptsTail && units.kind === 'count' && nextJoins(tokens, last) ? wordUnits(tokens, last + 1) : null;
  if (word !== null) ({ units, acceptsTail, last } = word);
  if (acceptsTail && units.kind === 'amount' && units.factor > 1n) {
    const read = readTail(tokens, last, numeral, units.factor);
    if (read === null) return null;
    ({ last, afterMagnitude } = read);
    units = { kind: 'amount', factor: read.factor };
    if (read.currencyMayFollow && nextJoins(tokens, last) && isCurrency(tokens[last + 1]?.meanings ?? [])) last += 1;
  }
  const quantity = { last, numeral, digitsWritten: digitCount(spaced.digits), sign: core === token.core ? token.sign : '', units, afterMagnitude };
  const half = units.kind === 'count' ? halfTokens(tokens, last) : 0;
  if (half === 0) return quantity;
  if (numeral.scale !== 0) return null;
  return { ...quantity, last: last + half, numeral: { digits: numeral.digits * 10n + 5n, scale: 1 }, digitsWritten: quantity.digitsWritten + 1 };
}

export function canonical({ numeral, digitsWritten, sign, units, afterMagnitude }: Quantity): CanonicalNumber | null {
  const negate = (value: bigint) => (sign === '-' ? -value : value);
  switch (units.kind) {
    case 'count':
    case 'measure':
      return countOf(numeral, digitsWritten, sign);
    case 'ratio': {
      const bp = toWholeDong(numeral, units.bp);
      return bp.ok ? { kind: 'ratio', bp: negate(bp.value) } : null;
    }
    case 'amount': {
      const vnd = toWholeDong(numeral, units.factor);
      return vnd.ok ? { kind: 'amount', vnd: negate(vnd.value + afterMagnitude) } : null;
    }
  }
}
