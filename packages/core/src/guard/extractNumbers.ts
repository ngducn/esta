import { businessDate, parseInstant } from '../clock/resolve';
import type { Instant } from '../clock/clock';
import { foldVietnamese } from '../search/fold';
import {
  JOINER,
  parseNumeral,
  readAmount,
  readArea,
  readCompact,
  readCount,
  readDate,
  readDayMonth,
  readMonth,
  readMonthYear,
  readRatio,
  readTime,
  readYear,
  unitSize,
  type CompactPart,
  type CompactUnit,
  type ExtractedValue,
} from './normalize';

export type ExtractedNumber = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly sentence: number;
  readonly value: ExtractedValue;
};

export type Citation = { readonly id: string; readonly sentence: number };

export type Scan = { readonly numbers: readonly ExtractedNumber[]; readonly citations: readonly Citation[] };

/** `unitEnd` ends the unit words a range lends its lower bound: `triệu` of `12 triệu 5`, never the `5`. */
type Found = { readonly end: number; readonly values: readonly ExtractedValue[]; readonly unitEnd?: number; readonly resume?: number };

type Reader = (text: string, at: number) => Found | null;

const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

const SIGN = '([-−+]?)';
/** A numeral, matched atomically: a pattern reads every digit and separator of it or does not match. */
const NUMBER = String.raw`(?=(?<numeral>\d+(?:${JOINER}\d+)*))\k<numeral>`;
const NOT_DIGIT = String.raw`(?![\p{N}])`;
const NOT_LETTER = String.raw`(?![\p{L}])`;
const CURRENCY = String.raw`(?:₫|đồng|đ|dong|[Vv][Nn][DdĐđ])${NOT_LETTER}`;
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?';
const ORDINAL = '(?:st|nd|rd|th)?';
const COUNT_UNIT = String.raw`(\s(?:ngày|tháng|năm|phòng|căn|lần|days?|months?|years?|rooms?|units?|times?)${NOT_LETTER})?`;

/** Magnitude words, keyed without diacritics or case. */
const MAGNITUDE_WORDS: Readonly<Record<string, CompactUnit>> = {
  ty: 'ty',
  ti: 'ty',
  bn: 'ty',
  billion: 'ty',
  billions: 'ty',
  trieu: 'tr',
  tr: 'tr',
  trd: 'tr',
  cu: 'tr',
  mil: 'tr',
  mio: 'tr',
  mln: 'tr',
  mn: 'tr',
  million: 'tr',
  millions: 'tr',
  nghin: 'nghin',
  ngan: 'nghin',
  thousand: 'nghin',
  thousands: 'nghin',
};
/** One-letter magnitudes keep their case: `m` alone is a metre unless a currency follows it. */
const LETTER_MAGNITUDES: Readonly<Record<string, CompactUnit>> = { B: 'ty', M: 'tr', K: 'nghin', k: 'nghin' };
/** `3 trăm nghìn` is 300 nghìn. Without a magnitude after it, `5 trăm` may be 500 or 500 nghìn. */
const MULTIPLIERS: Readonly<Record<string, bigint>> = { tram: 100n, chuc: 10n };
/** The glued shorthand `3tr5`, `1ty2` and `1k5` that parseVndInput accepts. */
const SHORTHAND_WORDS = new Set(['ty', 'ti', 'trieu', 'tr', 'trd', 'nghin', 'ngan', 'k']);
const HALF = 'ruoi';
const DIGIT_WORDS = new Set(['mot', 'hai', 'ba', 'bon', 'tu', 'nam', 'sau', 'bay', 'tam', 'chin']);
const CURRENCY_WORDS = new Set(['₫', 'd', 'dong', 'vnd']);

/** Basis points per unit of each percentage word. */
const RATIO_UNITS: Readonly<Record<string, bigint>> = {
  '%': 100n,
  'phần trăm': 100n,
  percent: 100n,
  'per cent': 100n,
  pct: 100n,
  '‰': 10n,
  'phần nghìn': 10n,
  'phần ngàn': 10n,
  'điểm cơ bản': 1n,
  'basis points': 1n,
  'basis point': 1n,
  bps: 1n,
  bp: 1n,
};
const RATIO_UNIT = String.raw`(${Object.keys(RATIO_UNITS)
  .map((word) => word.replaceAll(' ', String.raw`\s+`))
  .join('|')})${NOT_LETTER}`;
const ratioUnit = (word: string): bigint | undefined => RATIO_UNITS[word.toLowerCase().replace(/\s+/gu, ' ')];

const MONTH_NUMBERS: Readonly<Record<string, string>> = Object.fromEntries(
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((name, i) => [name, String(i + 1)]),
);
const monthNumber = (name: string): string => MONTH_NUMBERS[name.slice(0, 3).toLowerCase()] ?? '';

const sign = (text: string): 1 | -1 => (text === '-' || text === '−' ? -1 : 1);
const orNull = (value: ExtractedValue): readonly ExtractedValue[] | null => (value.kind === 'invalid' ? null : [value]);
const re = (source: string, flags = ''): RegExp => new RegExp(source, `yu${flags}`);
const invalid: ExtractedValue = { kind: 'invalid' };

function pattern(regex: RegExp, read: (match: RegExpExecArray) => readonly ExtractedValue[] | null): Reader {
  return (text, at) => {
    regex.lastIndex = at;
    const match = regex.exec(text);
    const values = match === null ? null : read(match);
    return match === null || values === null ? null : { end: at + match[0].length, values };
  };
}

const hcmTime = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A timestamp also allows the business date and wall-clock time it falls on in Asia/Ho_Chi_Minh. */
function readTimestamp(match: RegExpExecArray): readonly ExtractedValue[] {
  const [text, year = '', month = '', day = '', hour, minute, offset] = match;
  const date = readDate(year, month, day);
  if (hour === undefined || minute === undefined) return [date];
  const time = readTime(hour, minute);
  if (date.kind !== 'date' || time.kind !== 'time' || offset === undefined) return [date, time];
  const instant: Instant = parseInstant(text);
  const localDate = businessDate(instant, BUSINESS_TIMEZONE);
  const localTime = hcmTime.format(Date.parse(instant));
  return [date, time, { kind: 'date', iso: localDate }, { kind: 'time', hhmm: localTime }];
}

/** Tried in order at each digit, dates before values. The first reader that reads the whole numeral wins. */
const DATE_READERS: readonly Reader[] = [
  pattern(re(String.raw`(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?${NOT_DIGIT}`), readTimestamp),
  pattern(re(String.raw`(\d{4})-(\d{2})${NOT_DIGIT}`), ([, year = '', month = '']) => orNull(readMonthYear(month, year))),
  pattern(re(String.raw`(?<=[Nn]gày\s+)(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?${NOT_DIGIT}`), ([, day = '', month = '', year]) => [
    year === undefined ? readDayMonth(day, month) : readDate(year, month, day),
  ]),
  pattern(re(String.raw`(?<=[Tt]háng\s+)(\d{1,2})(?:\s+năm\s+(\d{4}))?(?![\p{N}/])`), ([, month = '', year]) => [
    year === undefined ? readMonth(month) : readMonthYear(month, year),
  ]),
  pattern(re(String.raw`(?<=[Nn]ăm\s+)(\d{4})${NOT_DIGIT}`), ([, year = '']) => [readYear(year)]),
  pattern(re(String.raw`(\d{1,2})${ORDINAL}\s+${MONTH},?\s+(\d{4})${NOT_DIGIT}`, 'i'), ([, day = '', month = '', year = '']) => [
    readDate(year, monthNumber(month), day),
  ]),
  pattern(re(String.raw`(?<=${MONTH}\s+)(\d{1,2})${ORDINAL},?\s+(\d{4})${NOT_DIGIT}`, 'i'), ([, month = '', day = '', year = '']) => [
    readDate(year, monthNumber(month), day),
  ]),
  pattern(re(String.raw`(?<=${MONTH}\s+)(\d{4})${NOT_DIGIT}`, 'i'), ([, month = '', year = '']) => [readMonthYear(monthNumber(month), year)]),
  pattern(re(String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})${NOT_DIGIT}`), ([, day = '', month = '', year = '']) => [readDate(year, month, day)]),
  pattern(re(String.raw`(\d{1,2})/(\d{4})${NOT_DIGIT}`), ([, month = '', year = '']) => orNull(readMonthYear(month, year))),
  pattern(re(String.raw`(\d{1,2})/(\d{1,2})(?![\p{N}/])`), ([, day = '', month = '']) => orNull(readDayMonth(day, month))),
  pattern(re(String.raw`(\d{1,2}):(\d{2})${NOT_DIGIT}`), ([, hour = '', minute = '']) => orNull(readTime(hour, minute))),
];

const RATIO = pattern(re(String.raw`${SIGN}${NUMBER}\s*${RATIO_UNIT}`, 'i'), ([, s = '', digits = '', word = '']) => {
  const multiplier = ratioUnit(word);
  return multiplier === undefined ? null : [readRatio(digits, sign(s), multiplier)];
});
const AREA = pattern(re(String.raw`${SIGN}${NUMBER}\s*m(?:²|2)(?![\p{L}\p{N}])`), ([, s = '', digits = '']) => [readArea(digits, sign(s))]);

const GAP = /[^\S\n]*/uy;
const WORD = /[\p{L}\p{M}]+|₫/uy;
const SIGNED_NUMERAL = re(`${SIGN}${NUMBER}`);
const NUMERAL = re(NUMBER);
const CURRENCY_AHEAD = re(String.raw`[^\S\n]*${CURRENCY}`);
/** Digits after a unit that start a date, a time, a range, a percentage or an area belong to that, not to the amount. */
const NOT_A_TAIL = re(String.raw`[/:\-–][\p{N}]|[^\S\n]*(?:%|‰|m²|m2${NOT_LETTER}|phần|percent|per${NOT_LETTER}|pct|bps?${NOT_LETTER}|điểm)`);

type Token = { readonly text: string; readonly end: number };

function tokenAt(regex: RegExp, text: string, at: number): Token | null {
  regex.lastIndex = at;
  const match = regex.exec(text);
  return match === null || match[0] === '' ? null : { text: match[0], end: at + match[0].length };
}

function gapEnd(text: string, at: number): number {
  GAP.lastIndex = at;
  GAP.exec(text);
  return GAP.lastIndex;
}

function magnitudeOf(word: Token, text: string): CompactUnit | undefined {
  if (word.text.length > 1) return MAGNITUDE_WORDS[foldVietnamese(word.text)];
  if (word.text === 'm') return tokenAt(CURRENCY_AHEAD, text, word.end) === null ? undefined : 'tr';
  return LETTER_MAGNITUDES[word.text];
}

const endsPhrase = (text: string, at: number): boolean => /^[^\S\n]*(?:[.,;:!?)\]\n]|$)/u.test(text.slice(at, at + 64));

type Magnitude = { readonly unit: CompactUnit; readonly size: bigint; readonly end: number } | { readonly unit: null; readonly end: number };

/** The magnitude after a numeral: `triệu`, `M` or `trăm nghìn`; a lone `trăm` is unreadable, and no word is no magnitude. */
function magnitudeAfter(text: string, at: number): Magnitude | null {
  const word = tokenAt(WORD, text, gapEnd(text, at));
  if (word === null) return null;
  const multiplier = MULTIPLIERS[foldVietnamese(word.text)];
  if (multiplier === undefined) {
    const unit = magnitudeOf(word, text);
    return unit === undefined ? null : { unit, size: unitSize(unit), end: word.end };
  }
  const next = tokenAt(WORD, text, gapEnd(text, word.end));
  const unit = next === null ? undefined : magnitudeOf(next, text);
  return next === null || unit === undefined ? { unit: null, end: word.end } : { unit, size: unitSize(unit) * multiplier, end: next.end };
}

const decimalOf = (digits: string, scale: number) => ({ digits: BigInt(digits), scale });

/**
 * An amount with magnitude words, read whole: a numeral and its magnitude (`3,5 tr`, `15.5M`, `3 trăm nghìn`), more
 * parts in falling magnitude (`1 tỷ 250 triệu`), then `rưỡi` or one tail of one or three digits (`3 triệu 5`,
 * `3 triệu 460`, `3tr5`), then a currency word. A two-digit tail (`3 triệu 50`), a digit word ending the phrase
 * (`3 triệu tư`), a part after a decimal and a magnitude word after the amount (`3 trăm nghìn tỷ`) are unreadable.
 */
function readMagnitude(text: string, at: number): Found | null {
  const lead = tokenAt(SIGNED_NUMERAL, text, at);
  const first = lead === null ? null : magnitudeAfter(text, lead.end);
  if (lead === null || first === null) return null;
  const numeral = parseNumeral(lead.text.replace(/^[-−+]/u, ''));
  if (first.unit === null || numeral === null) return { end: first.end, values: [invalid], unitEnd: first.end };
  const unitEnd = first.end;
  const fail = (end: number): Found => ({ end, values: [invalid], unitEnd });
  const parts: CompactPart[] = [{ numeral, size: first.size }];
  let last = { unit: first.unit, size: first.size, scale: numeral.scale };
  let end = first.end;
  let closed = false;
  for (;;) {
    const at = gapEnd(text, end);
    const word = tokenAt(WORD, text, at);
    if (word !== null) {
      const folded = foldVietnamese(word.text);
      if (magnitudeOf(word, text) !== undefined || MULTIPLIERS[folded] !== undefined) return fail(word.end);
      if (!closed && folded === HALF) {
        if (last.scale > 0) return fail(word.end);
        parts.push({ numeral: decimalOf('5', 1), size: last.size });
        closed = true;
        end = word.end;
        continue;
      }
      if (!closed && DIGIT_WORDS.has(folded) && endsPhrase(text, word.end)) return fail(word.end);
      if (CURRENCY_WORDS.has(folded)) {
        closed = true;
        end = word.end;
        continue;
      }
      break;
    }
    const digits = closed ? null : tokenAt(NUMERAL, text, at);
    if (digits === null || tokenAt(NOT_A_TAIL, text, digits.end) !== null) break;
    const next = magnitudeAfter(text, digits.end);
    if (next === null) {
      if (last.scale > 0 || !/^(?:\d|\d{3})$/u.test(digits.text)) return fail(digits.end);
      parts.push({ numeral: decimalOf(digits.text, digits.text.length), size: last.size });
      closed = true;
      end = digits.end;
      continue;
    }
    const value = parseNumeral(digits.text);
    if (next.unit === null || value === null || last.scale > 0 || next.size >= last.size) return fail(next.end);
    parts.push({ numeral: value, size: next.size });
    last = { unit: next.unit, size: next.size, scale: value.scale };
    end = next.end;
  }
  return { end, values: [readCompact(parts, sign(lead.text.charAt(0)), last.unit)], unitEnd };
}

const VALUE_READERS: readonly Reader[] = [
  RATIO,
  AREA,
  readMagnitude,
  pattern(re(String.raw`${SIGN}${NUMBER}\s*${CURRENCY}`), ([, s = '', digits = '']) => [readAmount(digits, sign(s))]),
  pattern(re(String.raw`${SIGN}${NUMBER}${COUNT_UNIT}`), ([, s = '', digits = '', unit]) => {
    const year = unit === undefined && s === '' && /^\d{4}$/u.test(digits) ? readYear(digits) : null;
    return [year?.kind === 'year' ? year : readCount(digits, sign(s))];
  }),
];

/** `3tr5`, `1ty2` and `1k5` alternate digits and letters like a code, so they are read before the code rule. */
const SHORTHAND = re(String.raw`(?<![\p{L}\p{N}])[-−+]?\d{1,3}([\p{L}\p{M}]+)\d{1,3}(?![\p{L}\p{N}])`);

function readShorthand(text: string, at: number): Found | null {
  SHORTHAND.lastIndex = at;
  const match = SHORTHAND.exec(text);
  return match !== null && SHORTHAND_WORDS.has(foldVietnamese(match[1] ?? '')) ? readMagnitude(text, at) : null;
}

/** Any digit, except a non-decimal digit after a letter, such as the ² in `m²`. */
const DIGIT = /\p{Nd}|(?<!\p{L})\p{N}/gu;
/** The span of one numeral in any script, which a reading must cover whole. */
const NUMERAL_SPAN = re(String.raw`[-−+]?\p{N}+(?:${JOINER}\p{N}+)*`);
const MAX_NUMERAL = 40;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;
const IS_DIGIT = /\p{N}/u;
const SPACE_JOINER = /[\p{Zs}\t]/u;
const JOINER_CHAR = new RegExp(`^${JOINER}$`, 'u');
const SENTENCE_END = /[.!?;](?=\s|$)|\n/gu;
const CITATION = /esta:\/\/[a-z_]+\/([A-Za-z0-9-]+)/gu;
const SKIP = /https?:\/\/[^\s)\]]+|esta:\/\/[^\s)\]]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|^[ \t]*\d{1,2}[.)](?=[ \t])/gimu;
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

const UPPER_CODE = /^(?:[A-Z]{3,}\d+|\d+[A-Z]{3,})$/u;
const GLUED_CURRENCY = /^(?:VN[DĐ])?\d+(?:VN[DĐ]|đ)?$/iu;
const AFTER_ESTA = /ESTA[^\S\n]*$/u;

/**
 * A code is a word that alternates between letters and digits at least twice (`7K2QX9MP`, `3PN2WC`), three or
 * more capitals glued to digits (`INV12`), or any word after `ESTA`: the run must contain the same word, read
 * case-insensitively. `Q7`, `Phòng5` and `12000000VND` are not codes.
 */
function codeWordAt(text: string, at: number): { readonly start: number; readonly end: number } | null {
  let start = at;
  while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) start -= 1;
  let end = at;
  while (end < text.length && WORD_CHAR.test(text.charAt(end))) end += 1;
  let transitions = 0;
  let wasLetter: boolean | undefined;
  for (const char of text.slice(start, end)) {
    const isLetter = LETTER.test(char);
    if (wasLetter !== undefined && wasLetter !== isLetter) transitions += 1;
    wasLetter = isLetter;
  }
  const word = text.slice(start, end);
  const isCode =
    !GLUED_CURRENCY.test(word) && (transitions >= 2 || UPPER_CODE.test(word) || AFTER_ESTA.test(text.slice(Math.max(0, start - 8), start)));
  return isCode ? { start, end } : null;
}

function numeralEnd(text: string, at: number): number {
  NUMERAL_SPAN.lastIndex = at;
  return NUMERAL_SPAN.exec(text) === null ? at + 1 : NUMERAL_SPAN.lastIndex;
}

/**
 * True when a reading stops inside a numeral, as `3tr5` does in `3tr5.000`. A date or a time may stop before a
 * space, since its last field is fixed: `07/10/2026 15:00` is a date and a time.
 */
function stopsInsideNumeral(text: string, end: number, fixedFields: boolean): boolean {
  if (!IS_DIGIT.test(text.charAt(end - 1))) return false;
  const next = text.charAt(end);
  if (IS_DIGIT.test(next)) return true;
  return JOINER_CHAR.test(next) && IS_DIGIT.test(text.charAt(end + 1)) && !(fixedFields && SPACE_JOINER.test(next));
}

function readAt(text: string, at: number, readers: readonly Reader[], fixedFields = false): Found | null {
  const whole = numeralEnd(text, at);
  for (const reader of readers) {
    const found = reader(text, at);
    if (found !== null && found.end >= whole && !stopsInsideNumeral(text, found.end, fixedFields)) return found;
  }
  return null;
}

const RANGE = re(String.raw`${SIGN}${NUMBER}(?:\s*[–—~−-]\s*|\s+(?:đến|tới|to|and|và|hoặc|hay|or)\s+)(?=[-−+]?\p{Nd})`, 'i');

/**
 * `8–12 triệu`, `từ 8 đến 12 triệu` and `8 and 12M ₫`: the lower bound is read with the upper bound's unit words and
 * nothing after them, so `8–12 triệu 5` claims 8 triệu. A range into a date, such as `12-15/10/2026`, is unreadable.
 */
function readRange(text: string, at: number): Found | null {
  RANGE.lastIndex = at;
  const range = RANGE.exec(text);
  if (range === null) return null;
  const upperAt = at + range[0].length;
  const date = readAt(text, upperAt, DATE_READERS, true);
  if (date !== null) return { end: date.end, values: [invalid], resume: upperAt };
  const upper = readAt(text, upperAt, VALUE_READERS);
  const upperNumber = tokenAt(SIGNED_NUMERAL, text, upperAt);
  if (upper === null || upperNumber === null) return null;
  const unit = text.slice(upperNumber.end, upper.unitEnd ?? upper.end);
  const lower = readAt(`${range[1] ?? ''}${range[2] ?? ''}${unit}`, 0, VALUE_READERS);
  return lower === null ? null : { end: upper.end, values: lower.values, resume: upperAt };
}

function sentenceAt(boundaries: readonly number[], position: number): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((boundaries[mid] ?? Infinity) < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

const isSignStart = (text: string, at: number): boolean =>
  at > 0 && /[-−+]/u.test(text.charAt(at - 1)) && (at === 1 || /[\s(]/u.test(text.charAt(at - 2)));

type Visible = { readonly text: string; readonly start: (at: number) => number; readonly end: (at: number) => number };

/** Default-ignorable marks such as U+200B or U+FE0F render as nothing, so the guard reads the text without them. */
function visible(text: string): Visible {
  if (!IGNORABLE.test(text)) return { text, start: (at) => at, end: (at) => at };
  const offsets: number[] = [];
  let kept = '';
  let index = 0;
  for (const char of text) {
    if (!IGNORABLE.test(char)) {
      kept += char;
      for (let i = 0; i < char.length; i++) offsets.push(index + i);
    }
    index += char.length;
  }
  return { text: kept, start: (at) => offsets[at] ?? text.length, end: (at) => (at === 0 ? 0 : (offsets[at - 1] ?? text.length - 1) + 1) };
}

export function scan(original: string): Scan {
  const { text, start: originalStart, end: originalEnd } = visible(original);
  const boundaries = [...text.matchAll(SENTENCE_END)].map((match) => match.index);
  const skips = [...text.matchAll(SKIP)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const citations = [...text.matchAll(CITATION)].map((match) => ({ id: match[1] ?? '', sentence: sentenceAt(boundaries, match.index) }));
  const numbers: ExtractedNumber[] = [];
  const push = (from: number, to: number, value: ExtractedValue): void => {
    const start = originalStart(from);
    const end = originalEnd(to);
    numbers.push({ text: original.slice(start, end), start, end, sentence: sentenceAt(boundaries, from), value });
  };
  let skipIndex = 0;
  DIGIT.lastIndex = 0;
  for (let match = DIGIT.exec(text); match !== null; match = DIGIT.exec(text)) {
    let at = match.index;
    while (skipIndex < skips.length && (skips[skipIndex]?.end ?? 0) <= at) skipIndex += 1;
    const skip = skips[skipIndex];
    if (skip !== undefined && skip.start <= at) {
      DIGIT.lastIndex = skip.end;
      continue;
    }
    if (isSignStart(text, at)) at -= 1;
    const whole = numeralEnd(text, at);
    if (whole - at > MAX_NUMERAL) {
      push(at, whole, invalid);
      DIGIT.lastIndex = whole;
      continue;
    }
    let found = readAt(text, at, [readShorthand]);
    if (found === null) {
      const code = codeWordAt(text, match.index);
      if (code !== null) {
        const end = Math.max(code.end, numeralEnd(text, match.index));
        const word = text.slice(code.start, end);
        push(code.start, end, end === code.end ? { kind: 'code', code: word.toUpperCase() } : invalid);
        DIGIT.lastIndex = end;
        continue;
      }
      found =
        readAt(text, at, DATE_READERS, true) ?? readRange(text, at) ?? readAt(text, at, VALUE_READERS) ?? { end: whole, values: [invalid] };
    }
    for (const value of found.values) push(at, found.end, value);
    DIGIT.lastIndex = found.resume ?? found.end;
  }
  return { numbers, citations };
}

export function extractNumbers(text: string): readonly ExtractedNumber[] {
  return scan(text).numbers;
}
