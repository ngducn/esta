import { businessDate, parseInstant } from '../clock/resolve';
import type { Instant } from '../clock/clock';
import {
  readAmount,
  readArea,
  readCompact,
  readCount,
  readDate,
  readDayMonth,
  readMonth,
  readMonthYear,
  readRatio,
  readShorthand,
  readSpoken,
  readTime,
  readYear,
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

type Found = { readonly end: number; readonly values: readonly ExtractedValue[]; readonly resume?: number };

type Pattern = {
  readonly regex: RegExp;
  readonly read: (match: RegExpExecArray) => readonly ExtractedValue[] | null;
};

const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

const SIGN = '([-−+]?)';
const GROUP_SPACE = String.raw`[ \u00A0\u202F\u2009]`;
/** `5 000 000` grouped by a space, NBSP, narrow NBSP or thin space, else `1.500.000` and `3,5` for parseDecimal. */
const NUMBER = String.raw`(\d{1,3}(?:${GROUP_SPACE}\d{3})+(?:[.,]\d{1,2})?(?![\p{N}])|\d+(?:[.,]\d+)*)`;
const NOT_DIGIT = String.raw`(?![\p{N}])`;
const NOT_LETTER = String.raw`(?![\p{L}])`;
const CURRENCY = String.raw`(?:₫|đồng|đ|dong|VNĐ|VND|vnd)${NOT_LETTER}`;
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?';
const ORDINAL = '(?:st|nd|rd|th)?';
const COUNT_UNIT = String.raw`(?:\s(?:ngày|tháng|năm|phòng|căn|lần|days?|months?|years?|rooms?|units?|times?)${NOT_LETTER})?`;

/** Unit words may follow a space, as may the letter units in `850 K ₫` and `15 M ₫`. */
const VI_UNITS: Readonly<Record<string, CompactUnit>> = {
  tỷ: 'ty',
  tỉ: 'ty',
  triệu: 'tr',
  trđ: 'tr',
  tr: 'tr',
  nghìn: 'nghin',
  ngàn: 'nghin',
};
const WORD_UNITS: Readonly<Record<string, CompactUnit>> = {
  ...VI_UNITS,
  billions: 'ty',
  billion: 'ty',
  bn: 'ty',
  millions: 'tr',
  million: 'tr',
  mln: 'tr',
  mn: 'tr',
  thousands: 'nghin',
  thousand: 'nghin',
};
const LETTER_UNITS: Readonly<Record<string, CompactUnit>> = { B: 'ty', M: 'tr', K: 'nghin', k: 'nghin' };
const WORD_UNIT = String.raw`(${Object.keys(WORD_UNITS).join('|')})${NOT_LETTER}`;
const VI_UNIT = String.raw`(?:${Object.keys(VI_UNITS).join('|')})${NOT_LETTER}`;
const VI_UNIT_WORDS = new RegExp(VI_UNIT, 'giu');

/** `3 trăm nghìn` is 300 nghìn. Without a unit after it, `5 trăm` may be 500 or 500 nghìn. */
const MULTIPLIER_WORDS: Readonly<Record<string, bigint>> = { trăm: 100n, chục: 10n };

const GAP = String.raw`[^\S\n]`;
const DIGIT_WORD = '(?:mốt|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín)';
/**
 * What may follow `3 triệu` in one spoken amount: another unit (`1 tỷ 250 triệu`, `1,2 nghìn tỷ`), `rưỡi`,
 * trailing digits (`3 triệu 5`), or a digit word ending the phrase (`3 triệu tư`). parseVndInput reads the
 * whole amount the way the app reads typed input, and anything it cannot read is unparseable.
 */
const SPOKEN_TAIL = String.raw`(?:${GAP}*\d+(?:[.,]\d+)*${GAP}*${VI_UNIT}|${GAP}*${VI_UNIT}|${GAP}+rưỡi${NOT_LETTER}|${GAP}+\d{1,3}(?![\p{N}]|[.,/:-]\p{N}|${GAP}*(?:%|m²|m2|trăm|chục))|${GAP}+${DIGIT_WORD}(?=${GAP}*(?:[.,;:!?)\]\n]|$)))`;

function lastUnit(body: string): CompactUnit | undefined {
  const words = body.match(VI_UNIT_WORDS) ?? [];
  const word = words.at(-1);
  return word === undefined ? undefined : VI_UNITS[word.toLowerCase()];
}
const LETTER_UNIT = String.raw`(${Object.keys(LETTER_UNITS).join('|')})(?![\p{L}\p{N}])`;

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

const SHORTHAND_UNITS: Readonly<Record<string, CompactUnit>> = { tỷ: 'ty', tỉ: 'ty', ty: 'ty', triệu: 'tr', trđ: 'tr', tr: 'tr', nghìn: 'nghin', ngàn: 'nghin', k: 'nghin' };

/** `3tr5`, `1ty2` and `1k5` alternate digits and letters like a code, so they are read before the code rule. */
const SHORTHAND: Pattern = {
  regex: re(String.raw`(?<![\p{L}\p{N}])(\d{1,3})(${Object.keys(SHORTHAND_UNITS).join('|')})(\d{1,3})(?![\p{L}\p{N}])`, 'i'),
  read: ([, whole = '', unit = '', fraction = '']) => {
    const compact = SHORTHAND_UNITS[unit.toLowerCase()];
    return compact === undefined ? null : [readShorthand(whole, fraction, compact)];
  },
};

/** Tried in order at each digit run, dates before values. The first pattern whose regex matches and whose read accepts wins. */
const DATE_PATTERNS: readonly Pattern[] = [
  {
    regex: re(String.raw`(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?${NOT_DIGIT}`),
    read: readTimestamp,
  },
  { regex: re(String.raw`(\d{4})-(\d{2})${NOT_DIGIT}`), read: ([, year = '', month = '']) => orNull(readMonthYear(month, year)) },
  {
    regex: re(String.raw`(?<=[Nn]gày\s+)(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?${NOT_DIGIT}`),
    read: ([, day = '', month = '', year]) => [year === undefined ? readDayMonth(day, month) : readDate(year, month, day)],
  },
  {
    regex: re(String.raw`(?<=[Tt]háng\s+)(\d{1,2})(?:\s+năm\s+(\d{4}))?(?![\p{N}/])`),
    read: ([, month = '', year]) => [year === undefined ? readMonth(month) : readMonthYear(month, year)],
  },
  { regex: re(String.raw`(?<=[Nn]ăm\s+)(\d{4})${NOT_DIGIT}`), read: ([, year = '']) => [readYear(year)] },
  {
    regex: re(String.raw`(\d{1,2})${ORDINAL}\s+${MONTH},?\s+(\d{4})${NOT_DIGIT}`, 'i'),
    read: ([, day = '', month = '', year = '']) => [readDate(year, monthNumber(month), day)],
  },
  {
    regex: re(String.raw`(?<=${MONTH}\s+)(\d{1,2})${ORDINAL},?\s+(\d{4})${NOT_DIGIT}`, 'i'),
    read: ([, month = '', day = '', year = '']) => [readDate(year, monthNumber(month), day)],
  },
  {
    regex: re(String.raw`(?<=${MONTH}\s+)(\d{4})${NOT_DIGIT}`, 'i'),
    read: ([, month = '', year = '']) => [readMonthYear(monthNumber(month), year)],
  },
  {
    regex: re(String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})${NOT_DIGIT}`),
    read: ([, day = '', month = '', year = '']) => [readDate(year, month, day)],
  },
  { regex: re(String.raw`(\d{1,2})/(\d{4})${NOT_DIGIT}`), read: ([, month = '', year = '']) => orNull(readMonthYear(month, year)) },
  { regex: re(String.raw`(\d{1,2})/(\d{1,2})(?![\p{N}/])`), read: ([, day = '', month = '']) => orNull(readDayMonth(day, month)) },
  { regex: re(String.raw`(\d{1,2}):(\d{2})${NOT_DIGIT}`), read: ([, hour = '', minute = '']) => orNull(readTime(hour, minute)) },
];

const VALUE_PATTERNS: readonly Pattern[] = [
  {
    regex: re(String.raw`${SIGN}${NUMBER}\s*${RATIO_UNIT}`, 'i'),
    read: ([, s = '', digits = '', word = '']) => {
      const multiplier = ratioUnit(word);
      return multiplier === undefined ? null : [readRatio(digits, sign(s), multiplier)];
    },
  },
  { regex: re(String.raw`${SIGN}${NUMBER}\s*m(?:²|2)(?![\p{L}\p{N}])`), read: ([, s = '', digits = '']) => [readArea(digits, sign(s))] },
  {
    regex: re(String.raw`${SIGN}${NUMBER}\s*(trăm|chục)${NOT_LETTER}(?:${GAP}+${WORD_UNIT})?`, 'i'),
    read: ([, s = '', digits = '', word = '', unit]) => {
      const compact = unit === undefined ? undefined : WORD_UNITS[unit.toLowerCase()];
      const multiplier = MULTIPLIER_WORDS[word.toLowerCase()];
      return [compact === undefined || multiplier === undefined ? { kind: 'invalid' } : readCompact(digits, sign(s), compact, multiplier)];
    },
  },
  {
    regex: re(String.raw`${SIGN}(${NUMBER}${GAP}*${VI_UNIT}${SPOKEN_TAIL}+)(?:\s*${CURRENCY})?`, 'i'),
    read: ([, s = '', body = '']) => {
      const unit = lastUnit(body);
      return [unit === undefined ? { kind: 'invalid' } : readSpoken(body, sign(s), unit)];
    },
  },
  {
    regex: re(String.raw`${SIGN}${NUMBER}\s*${WORD_UNIT}(?:\s*${CURRENCY})?`, 'i'),
    read: ([, s = '', digits = '', unit = '']) => {
      const compact = WORD_UNITS[unit.toLowerCase()];
      return compact === undefined ? null : [readCompact(digits, sign(s), compact)];
    },
  },
  {
    regex: re(String.raw`${SIGN}${NUMBER}\s*${LETTER_UNIT}(?:\s*${CURRENCY})?`),
    read: ([, s = '', digits = '', unit = '']) => {
      const compact = LETTER_UNITS[unit];
      return compact === undefined ? null : [readCompact(digits, sign(s), compact)];
    },
  },
  { regex: re(String.raw`${SIGN}${NUMBER}\s*${CURRENCY}`), read: ([, s = '', digits = '']) => [readAmount(digits, sign(s))] },
  { regex: re(String.raw`${SIGN}\d+(?:${GROUP_SPACE}+\d+)+\s*${CURRENCY}`), read: () => [{ kind: 'invalid' }] },
  { regex: re(String.raw`${SIGN}${NUMBER}${COUNT_UNIT}`), read: ([, s = '', digits = '']) => [readCount(digits, sign(s))] },
];

const DIGIT = /\p{Nd}/gu;
const UNREADABLE = /[-−]?\p{Nd}+/yu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;
const SENTENCE_END = /[.!?;](?=\s|$)|\n/gu;
const CITATION = /esta:\/\/[a-z_]+\/([A-Za-z0-9-]+)/gu;
const SKIP = /https?:\/\/[^\s)\]]+|esta:\/\/[^\s)\]]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|^[ \t]*\d+[.)](?=[ \t])/gimu;

/**
 * A word that alternates between letters and digits at least twice, such as a memo code `7K2QX9MP` or
 * `3PN2WC`, is a code: the run must contain the same word, read case-insensitively. `Q7` and `Phòng5` are not codes.
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
  return transitions >= 2 ? { start, end } : null;
}

/** Digits no pattern reads, such as full-width `１３`, still count as a number the guard cannot read. */
function unreadable(text: string, at: number): Found {
  UNREADABLE.lastIndex = at;
  const match = UNREADABLE.exec(text);
  return { end: at + (match?.[0].length ?? 1), values: [{ kind: 'invalid' }] };
}

function readAt(text: string, at: number, patterns: readonly Pattern[]): Found | null {
  for (const pattern of patterns) {
    pattern.regex.lastIndex = at;
    const match = pattern.regex.exec(text);
    if (match === null) continue;
    const values = pattern.read(match);
    if (values !== null) return { end: at + match[0].length, values };
  }
  return null;
}

const RANGE = re(String.raw`${SIGN}${NUMBER}(?:\s*[–—~−-]\s*|\s+(?:đến|tới|to|and|và|hoặc|hay|or)\s+)(?=[-−+]?\p{Nd})`, 'i');
const BOUND = re(String.raw`${SIGN}${NUMBER}`);

/** `8–12 triệu`, `từ 8 đến 12 triệu` and `8 and 12M ₫`: the lower bound is read with the upper bound's unit, and the upper bound on its own. */
function readRange(text: string, at: number): Found | null {
  RANGE.lastIndex = at;
  const range = RANGE.exec(text);
  if (range === null) return null;
  const upperAt = at + range[0].length;
  const upper = readAt(text, upperAt, VALUE_PATTERNS);
  BOUND.lastIndex = upperAt;
  const upperNumber = BOUND.exec(text);
  if (upper === null || upperNumber === null) return null;
  const unit = text.slice(upperAt + upperNumber[0].length, upper.end);
  const lower = readAt(`${range[1] ?? ''}${range[2] ?? ''}${unit}`, 0, VALUE_PATTERNS);
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

export function scan(text: string): Scan {
  const boundaries = [...text.matchAll(SENTENCE_END)].map((match) => match.index);
  const skips = [...text.matchAll(SKIP)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const citations = [...text.matchAll(CITATION)].map((match) => ({ id: match[1] ?? '', sentence: sentenceAt(boundaries, match.index) }));
  const numbers: ExtractedNumber[] = [];
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
    let found = readAt(text, at, [SHORTHAND]);
    if (found === null) {
      const code = codeWordAt(text, at);
      if (code !== null) {
        const word = text.slice(code.start, code.end);
        const sentence = sentenceAt(boundaries, code.start);
        numbers.push({ text: word, start: code.start, end: code.end, sentence, value: { kind: 'code', code: word.toUpperCase() } });
        DIGIT.lastIndex = code.end;
        continue;
      }
      if (isSignStart(text, at)) at -= 1;
      found = readAt(text, at, DATE_PATTERNS) ?? readRange(text, at) ?? readAt(text, at, VALUE_PATTERNS) ?? unreadable(text, at);
    }
    const sentence = sentenceAt(boundaries, at);
    for (const value of found.values) numbers.push({ text: text.slice(at, found.end), start: at, end: found.end, sentence, value });
    DIGIT.lastIndex = found.resume ?? found.end;
  }
  return { numbers, citations };
}

export function extractNumbers(text: string): readonly ExtractedNumber[] {
  return scan(text).numbers;
}
