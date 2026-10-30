import type { IsoDate } from '../date/iso-date';
import { isoFromParts } from './date-input';

const DAY_FIRST = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/gu;
const ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gu;
const SPELLED = /(?<!\d)(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+|\s*,\s*)(\d{4})(?!\d)/giu;

/** A link's target or a bare address: its slug may hold a date, but not one the page writes out (#329). */
const LINKS = /\]\([^)]*\)|https?:\/\/\S+/gu;
/** The label the scan asks WebFetch to put before the article's own date line, copied as printed (#329). */
export const PUBLISHED_LABEL = 'Publication date';

const DATE_WORD = /(?<!\p{L})(?:đăng|cập nhật|xuất bản|công bố|published|publication|updated|posted)(?!\p{L})/iu;
/** The words before a line's colon, past any list or Markdown marks: `**Publication date:**`, `Ngày đăng:`. */
const LABEL = /^[\s>*_#-]*(\p{L}[\p{L} ]*?)[\s*_]*:/u;

/** The date lines of an answer, most trusted first: a labelled date line, then a line that says when it went up. */
const DATE_LINES: ReadonlyArray<(line: string) => boolean> = [(line) => DATE_WORD.test(LABEL.exec(line)?.[1] ?? ''), (line) => DATE_WORD.test(line)];

/**
 * Every calendar date a page's text writes out: `05/10/2026`, `5-10-2026`, `2026-10-05` and `ngày 5 tháng 10 năm 2026`,
 * leaving out dates inside a link. [app rule] English month names are not read, because the scan prefers Vietnamese
 * sources (AGENT.md §5.2).
 */
export function datesInText(text: string): ReadonlySet<IsoDate> {
  const found = new Set<IsoDate>();
  const add = (year = '', month = '', day = '') => {
    const date = isoFromParts(year, month, day);
    if (date.ok) found.add(date.value);
  };
  const normalized = text.normalize('NFC').replace(LINKS, ' ');
  for (const [, day, month, year] of normalized.matchAll(DAY_FIRST)) add(year, month, day);
  for (const [, year, month, day] of normalized.matchAll(ISO)) add(year, month, day);
  for (const [, day, month, year] of normalized.matchAll(SPELLED)) add(year, month, day);
  return found;
}

/**
 * The dates that can say when an article was published, read from WebFetch's answer: those on its labelled date line,
 * such as `Publication date: Thứ Hai, 05/10/2026, 08:30`, else on a line with a word such as đăng or cập nhật, so a
 * quoted time, a site header's clock or a related story's date does not count. [app rule] An answer with no such line
 * falls back to every date it writes out.
 */
export function publishedDates(text: string): ReadonlySet<IsoDate> {
  const lines = text.normalize('NFC').replace(LINKS, ' ').split('\n').filter((line) => datesInText(line).size > 0);
  const dateLines = DATE_LINES.map((isDateLine) => lines.filter(isDateLine)).find((found) => found.length > 0) ?? lines;
  return datesInText(dateLines.join('\n'));
}
