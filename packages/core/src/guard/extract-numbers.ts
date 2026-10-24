import type { Locale } from '../format';
import { parseLocaleNumeral } from '../parse/decimal';
import { canonicalDate, countOf, type CanonicalNumber } from './normalize';
import { readableText } from './on-screen-text';
import { canonical, COUNT, digitCount, readQuantity, type Quantity, type Units } from './quantity';
import { clauses, has, nextJoins, meaningOf, type Meaning, type Token } from './words';

/** A number as written and as read. `value: null` is a number no reading takes whole. */
export type ExtractedNumber = { readonly text: string; readonly value: CanonicalNumber | null };

type Ending = 'label' | 'magnitude' | 'other';
type Phrase = { readonly first: number; readonly last: number; readonly values: readonly (CanonicalNumber | null)[]; readonly ending: Ending };
const unreadable = (first: number, last: number): Phrase => ({ first, last, values: [null], ending: 'other' });

type DateShape = { readonly dayMonth: boolean; readonly value: CanonicalNumber | null };

function dateShape(core: string): DateShape | undefined {
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?)?$/u.exec(core);
  if (iso !== null) return { dayMonth: false, value: canonicalDate(Number(iso[1]), Number(iso[2]), iso[3] === undefined ? null : Number(iso[3])) };
  const monthYear = /^(\d{1,2})\/(\d{4})$/u.exec(core);
  if (monthYear !== null) return { dayMonth: false, value: canonicalDate(Number(monthYear[2]), Number(monthYear[1]), null) };
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d+)$/u.exec(core);
  if (full !== null) {
    const value = full[3]?.length === 4 ? canonicalDate(Number(full[3]), Number(full[2]), Number(full[1])) : null;
    return { dayMonth: false, value };
  }
  const dayMonth = /^(\d{1,2})\/(\d{1,2})$/u.exec(core);
  return dayMonth === null ? undefined : { dayMonth: true, value: canonicalDate(null, Number(dayMonth[2]), Number(dayMonth[1])) };
}

function small(tokens: readonly Token[], at: number, digits: RegExp): number | null {
  const token = tokens[at];
  return token !== undefined && token.sign === '' && digits.test(token.core) ? Number(token.core) : null;
}

const DAY = /^\d{1,2}$/u;
const YEAR = /^\d{4}$/u;

function yearAfter(tokens: readonly Token[], at: number, vietnamese: boolean): { year: number | null; last: number } {
  if (vietnamese) {
    const named = nextJoins(tokens, at) && meaningOf(tokens[at + 1], 'dateUnit')?.unit === 'year' && nextJoins(tokens, at + 1);
    const year = named ? small(tokens, at + 2, YEAR) : null;
    return year === null ? { year: null, last: at } : { year, last: at + 2 };
  }
  const year = tokens[at]?.listComma === true || nextJoins(tokens, at) ? small(tokens, at + 1, YEAR) : null;
  return year === null ? { year: null, last: at } : { year, last: at + 1 };
}

const DATE_CUE_REACH = 2;

function dateIntroduced(tokens: readonly Token[], at: number): boolean {
  if (tokens.length === 1) return true;
  const introduces = (token: Token) => has(token, 'dateCue') || meaningOf(token, 'dateUnit')?.unit === 'day';
  return tokens.slice(Math.max(0, at - DATE_CUE_REACH), at).some(introduces);
}

function readDate(tokens: readonly Token[], at: number): Phrase | null {
  const token = tokens[at];
  if (token === undefined) return null;
  const date = (last: number, year: number | null, month: number | null, day: number | null): Phrase => ({
    first: at,
    last,
    values: [canonicalDate(year, month, day)],
    ending: 'other',
  });
  const unit = meaningOf(token, 'dateUnit');
  if (unit !== undefined && nextJoins(tokens, at) && tokens[at - 1]?.digits !== true) {
    if (unit.unit === 'year') {
      const year = small(tokens, at + 1, YEAR);
      if (year !== null) return date(at + 1, year, null, null);
    }
    const first = small(tokens, at + 1, DAY);
    if (first !== null && unit.unit === 'month') {
      const { year, last } = yearAfter(tokens, at + 1, true);
      return date(last, year, first, null);
    }
    const monthWord = nextJoins(tokens, at + 1) && meaningOf(tokens[at + 2], 'dateUnit')?.unit === 'month' && nextJoins(tokens, at + 2);
    const month = monthWord ? small(tokens, at + 3, DAY) : null;
    if (first !== null && unit.unit === 'day') {
      if (month === null) return unreadable(at, at + 1);
      const { year, last } = yearAfter(tokens, at + 3, true);
      return date(last, year, month, first);
    }
  }
  const named = meaningOf(token, 'month');
  if (named !== undefined && nextJoins(tokens, at)) {
    const day = small(tokens, at + 1, DAY);
    const year = small(tokens, at + 1, YEAR);
    if (day !== null) {
      const after = yearAfter(tokens, at + 1, false);
      return date(after.last, after.year, named.month, day);
    }
    if (year !== null) return date(at + 1, year, named.month, null);
  }
  if (!token.digits) return null;
  const monthAfter = nextJoins(tokens, at) ? meaningOf(tokens[at + 1], 'month') : undefined;
  const day = small(tokens, at, DAY);
  if (day !== null && monthAfter !== undefined) {
    const { year, last } = yearAfter(tokens, at + 1, false);
    return date(last, year, monthAfter.month, day);
  }
  const shape = dateShape(token.core);
  if (shape === undefined || (shape.dayMonth && !dateIntroduced(tokens, at))) return null;
  return { first: at, last: at, values: [token.sign === '' ? shape.value : null], ending: 'other' };
}

function nextElement(tokens: readonly Token[], at: number): number | null {
  const connected = nextJoins(tokens, at) && has(tokens[at + 1], 'connective') && nextJoins(tokens, at + 1);
  const next = tokens[at]?.listComma === true ? at + 1 : connected ? at + 2 : null;
  const token = next === null ? undefined : tokens[next];
  return token !== undefined && token.digits && dateShape(token.core) === undefined ? next : null;
}

const bare = (quantity: Quantity) => quantity.units.kind === 'count';

function withCarriedUnits(elements: readonly Quantity[], currency: boolean): (CanonicalNumber | null)[] | null {
  const values: (CanonicalNumber | null)[] = [];
  let carry: Units | null = currency ? { kind: 'amount', factor: 1n } : null;
  for (const element of elements.toReversed()) {
    if (currency && (element.units.kind === 'ratio' || element.units.kind === 'measure')) return null;
    if (!bare(element)) carry = element.units;
    values.unshift(canonical(bare(element) && carry !== null ? { ...element, units: carry, afterMagnitude: 0n } : element));
  }
  return values;
}

function readList(tokens: readonly Token[], at: number, start: number, locale: Locale, currency: boolean): Phrase {
  const token = tokens[start];
  const glued = token === undefined ? null : /^(\d[\d.,]*)[-–—~](\d.*)$/u.exec(token.core);
  const elements: Quantity[] = [];
  if (glued !== null && token !== undefined) {
    const lower = parseLocaleNumeral(glued[1] ?? '', locale);
    const upper = readQuantity(tokens, start, locale, glued[2]);
    if (lower === null || upper === null || token.sign !== '') return unreadable(at, upper?.last ?? start);
    elements.push({ last: start, numeral: lower, digitsWritten: digitCount(glued[1] ?? ''), sign: '', units: COUNT, afterMagnitude: 0n }, upper);
  } else {
    const first = readQuantity(tokens, start, locale);
    if (first === null) return unreadable(at, start);
    elements.push(first);
  }
  let previous = elements.at(-1);
  let next = previous === undefined ? null : nextElement(tokens, previous.last);
  while (previous !== undefined && next !== null) {
    const quantity = readQuantity(tokens, next, locale);
    if (quantity === null) return unreadable(at, next);
    if (!bare(previous) && bare(quantity)) {
      if (nextJoins(tokens, quantity.last) && /\p{L}/u.test(tokens[quantity.last + 1]?.body ?? '')) break;
      return unreadable(at, quantity.last);
    }
    elements.push(quantity);
    previous = quantity;
    next = nextElement(tokens, quantity.last);
  }
  const last = elements.at(-1);
  const values = withCarriedUnits(elements, currency);
  if (values === null) return unreadable(at, last?.last ?? start);
  const ending = last?.units.kind === 'amount' && last.units.factor > 1n ? 'magnitude' : 'other';
  return { first: at, last: last?.last ?? start, values, ending };
}

function readNumber(tokens: readonly Token[], at: number, locale: Locale): Phrase | null {
  const currency = meaningOf(tokens[at], 'currency')?.strong === true && nextJoins(tokens, at) && tokens[at + 1]?.digits === true;
  const start = currency ? at + 1 : at;
  const token = tokens[start];
  if (token === undefined) return null;
  if (!token.digits) return token.hasDigit ? unreadable(at, at) : null;
  if (!currency && has(tokens[start - 1], 'label')) {
    const numeral = token.sign === '' ? parseLocaleNumeral(token.core, locale) : null;
    return { first: at, last: at, values: [numeral === null ? null : countOf(numeral, digitCount(token.core), '')], ending: 'label' };
  }
  const fraction = /^(\d+)\/(\d+)$/u.exec(token.core);
  if (fraction === null) return readList(tokens, at, start, locale, currency);
  if (token.sign !== '' || currency) return unreadable(at, start);
  const whole = (part: string) => countOf({ digits: BigInt(part), scale: 0 }, part.length, '');
  return { first: at, last: start, values: fraction.slice(1).map(whole), ending: 'other' };
}

function attaches(meaning: Meaning, ending: Ending): boolean {
  switch (meaning.kind) {
    case 'magnitude':
    case 'ratio':
    case 'unreadable':
    case 'half':
      return true;
    case 'currency':
      return meaning.strong || ending !== 'label';
    case 'digitWord':
      return ending === 'magnitude';
    default:
      return false;
  }
}

function attachedAt(tokens: readonly Token[], last: number, ending: Ending): number | null {
  const end = tokens[last];
  if (end === undefined || end.listComma) return null;
  const dash = (token: Token | undefined) => token !== undefined && has(token, 'connective') && !/\p{L}/u.test(token.body);
  let at = last + 1;
  let dashed = false;
  while (tokens[at]?.symbolOnly === true || dash(tokens[at])) {
    dashed ||= dash(tokens[at]);
    at += 1;
  }
  const next = tokens[at];
  if (next === undefined) return null;
  if (next.digits) return next.openedBefore || end.closedAfter || dashed ? null : at;
  return next.meanings.some((meaning) => attaches(meaning, ending)) && readDate(tokens, at) === null ? at : null;
}

function denyAttached(tokens: readonly Token[], phrase: Phrase): Phrase {
  let last = phrase.last;
  for (let next = attachedAt(tokens, last, phrase.ending); next !== null; next = attachedAt(tokens, last, 'magnitude')) last = next;
  return last === phrase.last ? phrase : unreadable(phrase.first, last);
}

/**
 * Every number in `text` as a reader of the household's locale takes it. Each token holding a digit is read whole by
 * one grammar or comes back unreadable, so no partial reading can stand in for a larger number.
 */
export function extractNumbers(text: string, locale: Locale): ExtractedNumber[] {
  const readable = readableText(text);
  return clauses(readable).flatMap((tokens) => {
    const numbers: ExtractedNumber[] = [];
    for (let at = 0; at < tokens.length; ) {
      const found = readDate(tokens, at) ?? readNumber(tokens, at, locale);
      if (found === null) {
        at += 1;
        continue;
      }
      const phrase = denyAttached(tokens, found);
      const text = readable.slice(tokens[phrase.first]?.start, tokens[phrase.last]?.end);
      numbers.push(...phrase.values.map((value) => ({ text, value })));
      at = phrase.last + 1;
    }
    return numbers;
  });
}
