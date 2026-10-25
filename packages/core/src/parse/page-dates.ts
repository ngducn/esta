import type { IsoDate } from '../date/iso-date';
import { isoFromParts } from './date-input';

const DAY_FIRST = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/gu;
const ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gu;
const SPELLED = /(?<!\d)(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+|\s*,\s*)(\d{4})(?!\d)/giu;

/**
 * Every calendar date a page's text writes out: `05/10/2026`, `5-10-2026`, `2026-10-05` and `ngày 5 tháng 10 năm 2026`.
 * [app rule] English month names are not read, because the scan prefers Vietnamese sources (AGENT.md §5.2).
 */
export function datesInText(text: string): ReadonlySet<IsoDate> {
  const found = new Set<IsoDate>();
  const add = (year = '', month = '', day = '') => {
    const date = isoFromParts(year, month, day);
    if (date.ok) found.add(date.value);
  };
  const normalized = text.normalize('NFC');
  for (const [, day, month, year] of normalized.matchAll(DAY_FIRST)) add(year, month, day);
  for (const [, year, month, day] of normalized.matchAll(ISO)) add(year, month, day);
  for (const [, day, month, year] of normalized.matchAll(SPELLED)) add(year, month, day);
  return found;
}
