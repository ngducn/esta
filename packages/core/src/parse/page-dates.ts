import type { IsoDate } from '../date/iso-date';
import { isoFromParts } from './date-input';

const DAY_FIRST = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/gu;
const ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gu;
const SPELLED = /(?<!\d)(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+|\s*,\s*)(\d{4})(?!\d)/giu;

/** A link's target or a bare address: its slug may hold a date, but not one the page writes out (#329). */
const LINKS = /\]\([^)]*\)|https?:\/\/\S+/gu;
/** A line that says when the page went up: a time of day, or a word such as đăng or cập nhật. */
const DATE_LINE = /(?<!\d)\d{1,2}[:h]\d{2}(?!\d)|(?<!\p{L})(?:đăng|cập nhật|xuất bản|published|updated|posted)(?!\p{L})/iu;

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
 * The dates that can say when an article was published: those on its own date line, which carries a time or a word
 * such as đăng, so a site header's today or a related story's date does not count. [app rule] A page with no such
 * line falls back to every date its text writes out.
 */
export function publishedDates(text: string): ReadonlySet<IsoDate> {
  const lines = text.normalize('NFC').replace(LINKS, ' ').split('\n');
  const dateLines = lines.filter((line) => DATE_LINE.test(line) && datesInText(line).size > 0);
  return datesInText((dateLines.length > 0 ? dateLines : lines).join('\n'));
}
