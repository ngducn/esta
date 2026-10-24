import { MONTHS_EN, type Locale } from '../format';
import { isoFromParts, readNumeral, times, toNumber, type CanonicalNumber, type Decimal } from './normalize';
import { readableText } from './on-screen-text';

/** A number as written and as read. `value: null` is a token with a digit that no reading takes whole. */
export type ExtractedNumber = { readonly text: string; readonly value: CanonicalNumber | null };

type Token = {
  /** The token without its opening and closing punctuation, sign included. */
  readonly body: string;
  readonly core: string;
  readonly word: string;
  readonly sign: '' | '-';
  readonly start: number;
  readonly end: number;
  /** Closing punctuation ends a number, so `5.` and `triệu` never join. */
  readonly closed: boolean;
  readonly trail: string;
  readonly bare: boolean;
};

const DIGIT = /\p{N}/u;
const LEAD = /^[([{"“‘'«]*/u;
const TRAIL = /[)\]}"”’'».,;:!?…]*$/u;

function tokenize(text: string): Token[] {
  return [...text.matchAll(/\S+/gu)].map((match) => {
    const raw = match[0];
    const lead = LEAD.exec(raw)?.[0].length ?? 0;
    const trail = TRAIL.exec(raw.slice(lead))?.[0].length ?? 0;
    const body = raw.slice(lead, raw.length - trail);
    const signed = /^[-−+]\d/u.test(body);
    const core = signed ? body.slice(1) : body;
    return {
      body,
      core,
      word: core.toLowerCase(),
      sign: signed && body[0] !== '+' ? '-' : '',
      start: match.index + lead,
      end: match.index + raw.length - trail,
      closed: trail > 0,
      trail: raw.slice(raw.length - trail),
      bare: lead === 0 && !signed,
    };
  });
}

/** Longest first, so `triệu` is tried before `tr`. A one-letter `M` or `B` counts only in capitals, since `5m` is metres. */
const MAGNITUDES: readonly (readonly [word: string, factor: bigint, capital?: true])[] = (
  [
    ['thousand', 1_000n],
    ['nghìn', 1_000n],
    ['nghin', 1_000n],
    ['ngàn', 1_000n],
    ['ngan', 1_000n],
    ['k', 1_000n],
    ['million', 1_000_000n],
    ['triệu', 1_000_000n],
    ['trieu', 1_000_000n],
    ['mil', 1_000_000n],
    ['mln', 1_000_000n],
    ['tr', 1_000_000n],
    ['m', 1_000_000n, true],
    ['billion', 1_000_000_000n],
    ['tỷ', 1_000_000_000n],
    ['tỉ', 1_000_000_000n],
    ['ty', 1_000_000_000n],
    ['ti', 1_000_000_000n],
    ['bn', 1_000_000_000n],
    ['b', 1_000_000_000n, true],
    ['hundred', 100n],
    ['trăm', 100n],
    ['tram', 100n],
  ] as const
).toSorted((a, b) => b[0].length - a[0].length);

const CURRENCIES = new Set(['₫', 'đ', 'đồng', 'dong', 'vnd', 'vnđ']);
const AREAS = new Set(['m²', 'm³', 'km²']);
const CONNECTIVES = new Set(['đến', 'tới', 'to', 'and', '-', '–', '—', '~']);
const HALF = new Set(['rưỡi', 'ruoi']);
/** Number words a reader adds to the magnitude before them (`3 triệu tư`), read as unreadable rather than guessed. */
const DIGIT_WORDS = new Set(['một', 'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín', 'mười', 'linh', 'lẻ']);
const MONTHS = new Map(MONTHS_EN.flatMap((name, index) => [[name, index + 1] as const, [name.slice(0, 3), index + 1] as const]));

type Unit = 'count' | 'amount' | 'percent' | 'bp';
type Units = { readonly unit: Unit; readonly magnitude: bigint };

/** What follows the digits inside one token, or a whole word after them: `tr`, `triệuđồng`, `%`, `₫/tháng`. */
function readUnits(text: string): Units | null {
  const word = text.replace(/\/\p{L}+$/u, '');
  const lower = word.toLowerCase();
  if (lower === '' || AREAS.has(lower)) return { unit: 'count', magnitude: 1n };
  if (lower === '%' || lower === 'percent') return { unit: 'percent', magnitude: 1n };
  if (lower === 'bp' || lower === 'bps') return { unit: 'bp', magnitude: 1n };
  const magnitude = MAGNITUDES.find(([name, , capital]) => lower.startsWith(name) && (capital !== true || word.startsWith(name.toUpperCase())));
  const rest = magnitude === undefined ? lower : lower.slice(magnitude[0].length);
  if (rest === '') return magnitude === undefined ? null : { unit: 'amount', magnitude: magnitude[1] };
  return CURRENCIES.has(rest) ? { unit: 'amount', magnitude: magnitude?.[1] ?? 1n } : null;
}

const unitWord = (token: Token | undefined): Units | null => (token === undefined || DIGIT.test(token.body) ? null : readUnits(token.body));

/** A quantity before it becomes a canonical number: `numeral × magnitude + tail` in its unit. */
type Reading = { readonly numeral: Decimal; readonly units: Units; readonly tail: bigint; readonly sign: '' | '-' };

function canonical({ numeral, units, tail, sign }: Reading): CanonicalNumber | null {
  const negate = (value: bigint | number) => (sign === '-' ? -value : value);
  switch (units.unit) {
    case 'count':
      return { kind: 'count', value: Number(negate(toNumber(numeral))) };
    case 'percent':
    case 'bp': {
      const bp = times(numeral, units.unit === 'percent' ? 100n : 1n);
      return bp === null ? null : { kind: 'ratio', bp: Number(negate(bp)) };
    }
    case 'amount': {
      const vnd = times(numeral, units.magnitude);
      return vnd === null ? null : { kind: 'amount', vnd: Number(negate(vnd + tail)) };
    }
  }
}

type Phrase = { readonly last: number; readonly values: readonly (CanonicalNumber | null)[] };

/** An unreadable number takes the words that could have been part of it, so `50` in `3 triệu 50` is not read on its own. */
function unreadable(tokens: readonly Token[], last: number): Phrase {
  let end = last;
  for (let next = tokens[end + 1]; next !== undefined && tokens[end]?.closed !== true; next = tokens[end + 1]) {
    if (!/^\d/u.test(next.body) && unitWord(next) === null && !DIGIT_WORDS.has(next.word) && !HALF.has(next.word)) break;
    end += 1;
  }
  return { last: end, values: [null] };
}

/**
 * After a magnitude word: `rưỡi` adds half of it, one digit adds tenths (`1 tỷ 2`), three digits the next magnitude
 * down (`1 tỷ 250`, optionally followed by `triệu`), and `trăm` multiplies the next magnitude (`3 trăm nghìn`).
 * Anything else that could change the amount is unreadable.
 */
function readTail(tokens: readonly Token[], at: number, numeral: Decimal, magnitude: bigint): { last: number; magnitude: bigint; tail: bigint } | null {
  const next = tokens[at + 1];
  const result = { last: at, magnitude, tail: 0n };
  if (next === undefined || tokens[at]?.closed === true) return magnitude === 100n ? null : result;
  const nextUnits = unitWord(next);
  if (nextUnits !== null && nextUnits.unit === 'amount' && nextUnits.magnitude > 1n) {
    if (magnitude !== 100n || nextUnits.magnitude < 1_000n) return null;
    const stacked = readTail(tokens, at + 1, numeral, nextUnits.magnitude * 100n);
    return stacked === null || stacked.tail !== 0n ? null : stacked;
  }
  if (magnitude === 100n) return null;
  if (HALF.has(next.word)) return { last: at + 1, magnitude, tail: magnitude / 2n };
  if (DIGIT_WORDS.has(next.word) && !(next.word === 'năm' && DIGIT.test(tokens[at + 2]?.body ?? ''))) return null;
  if (!DIGIT.test(next.body)) return result;
  if (numeral.scale !== 0 || !next.bare || next.sign !== '') return null;
  if (/^\d$/.test(next.core)) return { last: at + 1, magnitude, tail: (BigInt(next.core) * magnitude) / 10n };
  if (!/^\d{3}$/.test(next.core) || magnitude < 1_000_000n) return null;
  const lower = magnitude / 1_000n;
  const named = unitWord(tokens[at + 2]);
  if (named !== null && named.unit === 'amount' && named.magnitude > 1n && !next.closed) {
    return named.magnitude === lower ? { last: at + 2, magnitude, tail: BigInt(next.core) * lower } : null;
  }
  return { last: at + 1, magnitude, tail: BigInt(next.core) * lower };
}

/** `5 000 000`: digit groups split by spaces join only as one valid grouping; any other digit run next to them is unreadable. */
function joinSpaceGroups(tokens: readonly Token[], at: number, digits: string): { last: number; digits: string; glued: string } | null {
  let last = at;
  let joined = digits;
  let glued = '';
  while (glued === '' && tokens[last]?.closed !== true) {
    const next = tokens[last + 1];
    if (next === undefined || !/^\d/u.test(next.body) || !next.bare) break;
    const group = /^(\d{3})(\D.*)?$/u.exec(next.core);
    if (group === null || !/^\d{1,3}$/.test(digits)) return null;
    joined += group[1];
    glued = group[2] ?? '';
    last += 1;
  }
  return { last, digits: joined, glued };
}

/** Units written as words after the digits, then a currency word: `25 triệu đồng`, `6,5 phần trăm`. */
function readWordUnits(tokens: readonly Token[], at: number, glued: Units, numeral: Decimal): { last: number; units: Units; tail: bigint } | null {
  let last = at;
  let units = glued;
  const open = () => tokens[last]?.closed !== true;
  if (units.unit === 'count' && units.magnitude === 1n && open()) {
    const next = tokens[last + 1];
    if (next?.word === 'phần' && tokens[last + 2]?.word === 'trăm') return { last: last + 2, units: { unit: 'percent', magnitude: 1n }, tail: 0n };
    const word = unitWord(next);
    if (word !== null && word.unit !== 'count') {
      units = word;
      last += 1;
    }
  }
  let tail = 0n;
  if (units.unit === 'amount' && units.magnitude > 1n) {
    const read = readTail(tokens, last, numeral, units.magnitude);
    if (read === null) return null;
    ({ last, tail } = read);
    units = { unit: 'amount', magnitude: read.magnitude };
  }
  const currency = unitWord(tokens[last + 1]);
  if (open() && units.unit !== 'percent' && units.unit !== 'bp' && currency?.unit === 'amount' && currency.magnitude === 1n) {
    return { last: last + 1, units: { unit: 'amount', magnitude: units.magnitude }, tail };
  }
  return { last, units, tail };
}

type Quantity = { readonly last: number; readonly reading: Reading };

/** One quantity from the digit token at `at`, with its space groups, units and tail. */
function readQuantity(tokens: readonly Token[], at: number, locale: Locale, currency: boolean, core = tokens[at]?.core): Quantity | 'unreadable' | null {
  const token = tokens[at];
  if (token === undefined || core === undefined) return null;
  const match = /^(\d[\d.,]*)(.*)$/u.exec(core);
  if (match === null) return 'unreadable';
  const spaced = joinSpaceGroups(tokens, at, match[1] ?? '');
  if (spaced === null) return 'unreadable';
  const numeral = readNumeral(spaced.digits, locale);
  const glued = readUnits(spaced.last === at ? (match[2] ?? '') : spaced.glued);
  if (numeral === null || glued === null) return 'unreadable';
  const words = readWordUnits(tokens, spaced.last, glued, numeral);
  if (words === null) return 'unreadable';
  let { last, units } = words;
  if (currency) {
    if (units.unit !== 'count' && units.unit !== 'amount') return 'unreadable';
    units = { unit: 'amount', magnitude: units.magnitude };
  }
  const reading = { numeral, units, tail: words.tail, sign: core === token.core ? token.sign : '' };
  if (units.unit === 'count' && tokens[last]?.closed !== true && HALF.has(tokens[last + 1]?.word ?? '')) {
    return { last: last + 1, reading: { ...reading, numeral: { units: numeral.units * 10n + 5n * 10n ** BigInt(numeral.scale), scale: numeral.scale + 1 } } };
  }
  return { last, reading };
}

const NOT_A_CLAIM = (token: Token) => AREAS.has(token.word) || /^[a-z][a-z0-9+.-]*:\/\//iu.test(token.body);

/** `12 ngày`, `15.000.000 ₫`, `từ 8 đến 12 triệu`, where the lower bound takes only the upper bound's unit. */
function readNumberPhrase(tokens: readonly Token[], at: number, locale: Locale): Phrase | null {
  const first = tokens[at];
  if (first === undefined) return null;
  const currency = CURRENCIES.has(first.word) && !first.closed && DIGIT.test(tokens[at + 1]?.body ?? '');
  const start = currency ? at + 1 : at;
  const token = tokens[start];
  if (token === undefined || !DIGIT.test(token.body) || NOT_A_CLAIM(token)) return null;
  const date = readDateToken(token.core);
  if (date !== undefined) return date === null || currency || token.sign !== '' ? unreadable(tokens, start) : { last: start, values: [date] };
  const range = /^(\d[\d.,]*)[-–—~](\d.*)$/u.exec(token.core);
  if (range !== null) {
    const lower = readNumeral(range[1] ?? '', locale);
    const upper = readQuantity(tokens, start, locale, currency, range[2]);
    if (lower === null || upper === null || upper === 'unreadable' || token.sign !== '') return unreadable(tokens, upper === null || upper === 'unreadable' ? start : upper.last);
    return { last: upper.last, values: [canonical({ ...upper.reading, numeral: lower, tail: 0n }), canonical(upper.reading)] };
  }
  const quantity = readQuantity(tokens, start, locale, currency);
  if (quantity === null) return null;
  if (quantity === 'unreadable') return unreadable(tokens, start);
  const { last, reading } = quantity;
  const after = tokens[last + 1];
  if (tokens[last]?.closed !== true && after !== undefined && /^\d/u.test(after.body) && after.bare) return unreadable(tokens, last + 1);
  if (reading.units.unit !== 'count' || reading.tail !== 0n || tokens[last]?.closed === true || !CONNECTIVES.has(after?.word ?? '')) return { last, values: [canonical(reading)] };
  const upperToken = tokens[last + 2];
  const upper = upperToken === undefined || readDateToken(upperToken.core) !== undefined || !upperToken.bare ? null : readQuantity(tokens, last + 2, locale, false);
  if (upper === null) return { last, values: [canonical(reading)] };
  if (upper === 'unreadable') return unreadable(tokens, last + 2);
  return { last: upper.last, values: [canonical({ ...upper.reading, numeral: reading.numeral, tail: 0n, sign: reading.sign }), canonical(upper.reading)] };
}

/** `07/10/2026`, `7/10`, `10/2026`, `2026-10-07` and a timestamp's date; `undefined` when it is not date-shaped. */
function readDateToken(core: string): CanonicalNumber | null | undefined {
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?)?$/u.exec(core);
  const dayMonth = /^(\d{1,2})\/(\d{1,2})(?:\/(\d+))?$/u.exec(core);
  const monthYear = /^(\d{1,2})\/(\d{4})$/u.exec(core);
  let date: string | null;
  if (iso !== null) date = isoFromParts(Number(iso[1]), Number(iso[2]), iso[3] === undefined ? null : Number(iso[3]));
  else if (monthYear !== null) date = isoFromParts(Number(monthYear[2]), Number(monthYear[1]), null);
  else if (dayMonth !== null) date = dayMonth[3] !== undefined && dayMonth[3].length !== 4 ? null : isoFromParts(dayMonth[3] === undefined ? null : Number(dayMonth[3]), Number(dayMonth[2]), Number(dayMonth[1]));
  else return undefined;
  return date === null ? null : { kind: 'date', iso: date };
}

const plain = (token: Token | undefined, digits: RegExp): number | null => (token !== undefined && token.bare && digits.test(token.core) ? Number(token.core) : null);

/** Dates in words: `ngày 7 tháng 10 năm 2026`, `tháng 10`, `October 7, 2026`, `7 October`, `October 2026`. */
function readDateWords(tokens: readonly Token[], at: number): Phrase | null {
  const token = tokens[at];
  if (token === undefined) return null;
  const date = (last: number, year: number | null, month: number, day: number | null): Phrase => {
    const iso = isoFromParts(year, month, day);
    return { last, values: [iso === null ? null : { kind: 'date', iso }] };
  };
  const yearAfter = (index: number, word?: string): { year: number | null; last: number } => {
    const offset = word === undefined ? 1 : 2;
    const year = (tokens[index]?.closed === true && !(word === undefined && tokens[index]?.trail === ',')) || (word !== undefined && tokens[index + 1]?.word !== word) ? null : plain(tokens[index + offset], /^\d{4}$/);
    return year === null ? { year: null, last: index } : { year, last: index + offset };
  };
  if (token.word === 'ngày' && !token.closed && tokens[at + 2]?.word === 'tháng' && tokens[at + 1]?.closed !== true) {
    const day = plain(tokens[at + 1], /^\d{1,2}$/);
    const month = plain(tokens[at + 3], /^\d{1,2}$/);
    if (day !== null && month !== null) {
      const { year, last } = yearAfter(at + 3, 'năm');
      return date(last, year, month, day);
    }
  }
  if (token.word === 'tháng' && !token.closed && !DIGIT.test(tokens[at - 1]?.body ?? '')) {
    const month = plain(tokens[at + 1], /^\d{1,2}$/);
    if (month !== null) {
      const { year, last } = yearAfter(at + 1, 'năm');
      return date(last, year, month, null);
    }
  }
  const named = MONTHS.get(token.body);
  if (named !== undefined && !token.closed) {
    const day = plain(tokens[at + 1], /^\d{1,2}$/);
    if (day !== null) {
      const { year, last } = yearAfter(at + 1);
      return date(last, year, named, day);
    }
    const year = plain(tokens[at + 1], /^\d{4}$/);
    if (year !== null) return date(at + 1, year, named, null);
  }
  const day = plain(token, /^\d{1,2}$/);
  const month = token.closed ? undefined : MONTHS.get(tokens[at + 1]?.body ?? '');
  if (day !== null && month !== undefined) {
    const { year, last } = yearAfter(at + 1);
    return date(last, year, month, day);
  }
  return null;
}


/**
 * Every number in `text` as a reader of the household's locale takes it. Each whitespace token holding a digit is
 * read whole by one grammar or comes back unreadable, so no partial reading can stand in for a larger number.
 */
export function extractNumbers(text: string, locale: Locale): ExtractedNumber[] {
  const readable = readableText(text);
  const tokens = tokenize(readable);
  const numbers: ExtractedNumber[] = [];
  for (let at = 0; at < tokens.length; ) {
    const token = tokens[at];
    if (token === undefined) break;
    const phrase = readDateWords(tokens, at) ?? readNumberPhrase(tokens, at, locale);
    if (phrase === null) {
      at += 1;
      continue;
    }
    const spanText = readable.slice(token.start, tokens[phrase.last]?.end ?? token.end);
    for (const value of phrase.values) numbers.push({ text: spanText, value });
    at = phrase.last + 1;
  }
  return numbers;
}
