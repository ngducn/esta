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

type Pattern = {
  readonly regex: RegExp;
  readonly read: (match: RegExpExecArray) => readonly ExtractedValue[] | null;
};

const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

const SIGN = '([-−]?)';
const NUMBER = String.raw`(\d+(?:[.,]\d+)*)`;
const NOT_DIGIT = String.raw`(?![\p{N}])`;
const NOT_LETTER = String.raw`(?![\p{L}])`;
const CURRENCY = String.raw`(?:₫|đồng|đ|dong|VNĐ|VND|vnd)${NOT_LETTER}`;
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?';
const ORDINAL = '(?:st|nd|rd|th)?';
const COUNT_UNIT = String.raw`(?:\s(?:ngày|tháng|năm|phòng|căn|lần|days?|months?|years?|rooms?|units?|times?)${NOT_LETTER})?`;

/** Vietnamese unit words may follow a space; the letter units are glued, as `850K ₫` and `850k` are written. */
const VI_UNITS: Readonly<Record<string, CompactUnit>> = {
  tỷ: 'ty',
  tỉ: 'ty',
  triệu: 'tr',
  trđ: 'tr',
  tr: 'tr',
  nghìn: 'nghin',
  ngàn: 'nghin',
};
const EN_UNITS: Readonly<Record<string, CompactUnit>> = { B: 'ty', M: 'tr', K: 'nghin', k: 'nghin' };
const VI_UNIT = String.raw`(${Object.keys(VI_UNITS).join('|')})${NOT_LETTER}`;
const EN_UNIT = String.raw`(${Object.keys(EN_UNITS).join('|')})(?![\p{L}\p{N}])`;

const MONTH_NUMBERS: Readonly<Record<string, string>> = Object.fromEntries(
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((name, i) => [name, String(i + 1)]),
);
const monthNumber = (name: string): string => MONTH_NUMBERS[name.slice(0, 3).toLowerCase()] ?? '';

const sign = (text: string): 1 | -1 => (text === '' ? 1 : -1);
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

/** Tried in order at each digit run. The first pattern whose regex matches and whose read accepts wins. */
const PATTERNS: readonly Pattern[] = [
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
  { regex: re(String.raw`${SIGN}${NUMBER}\s*%`), read: ([, , digits = '']) => [readRatio(digits)] },
  { regex: re(String.raw`${SIGN}${NUMBER}\s*m(?:²|2)(?![\p{L}\p{N}])`), read: ([, , digits = '']) => [readArea(digits)] },
  {
    regex: re(String.raw`${SIGN}${NUMBER}\s*${VI_UNIT}(?:\s*${CURRENCY})?`, 'i'),
    read: ([, s = '', digits = '', unit = '']) => {
      const compact = VI_UNITS[unit.toLowerCase()];
      return compact === undefined ? null : [readCompact(digits, sign(s), compact)];
    },
  },
  {
    regex: re(String.raw`${SIGN}${NUMBER}${EN_UNIT}(?:\s*₫)?`),
    read: ([, s = '', digits = '', unit = '']) => {
      const compact = EN_UNITS[unit];
      return compact === undefined ? null : [readCompact(digits, sign(s), compact)];
    },
  },
  { regex: re(String.raw`${SIGN}${NUMBER}\s*${CURRENCY}`), read: ([, s = '', digits = '']) => [readAmount(digits, sign(s))] },
  { regex: re(String.raw`${SIGN}${NUMBER}${COUNT_UNIT}`), read: ([, , digits = '']) => [readCount(digits)] },
];

const DIGIT = /\d/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;
const SENTENCE_END = /[.!?;](?=\s|$)|\n/gu;
const CITATION = /esta:\/\/[a-z_]+\/([A-Za-z0-9-]+)/gu;
const SKIP = /https?:\/\/[^\s)\]]+|esta:\/\/[^\s)\]]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|^[ \t]*\d+[.)](?=[ \t])/gimu;

/**
 * A word that alternates between letters and digits at least twice, such as a memo code `7K2QX9MP` or
 * a hex id, is a code: its digits are not numbers on either side of the guard. `Q7` and `Phòng5` are not codes.
 */
function codeWordEnd(text: string, at: number): number | null {
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
  return transitions >= 2 ? end : null;
}

function readAt(text: string, at: number): { readonly end: number; readonly values: readonly ExtractedValue[] } | null {
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = at;
    const match = pattern.regex.exec(text);
    if (match === null) continue;
    const values = pattern.read(match);
    if (values !== null) return { end: at + match[0].length, values };
  }
  return null;
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
  at > 0 && (text[at - 1] === '-' || text[at - 1] === '−') && (at === 1 || /[\s(]/u.test(text.charAt(at - 2)));

/** Every number in a text with its sentence, plus the `esta://` records each sentence cites. */
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
    const codeEnd = codeWordEnd(text, at);
    if (codeEnd !== null) {
      DIGIT.lastIndex = codeEnd;
      continue;
    }
    if (isSignStart(text, at)) at -= 1;
    const found = readAt(text, at);
    if (found === null) continue;
    const sentence = sentenceAt(boundaries, at);
    for (const value of found.values) numbers.push({ text: text.slice(at, found.end), start: at, end: found.end, sentence, value });
    DIGIT.lastIndex = found.end;
  }
  return { numbers, citations };
}

export function extractNumbers(text: string): readonly ExtractedNumber[] {
  return scan(text).numbers;
}
