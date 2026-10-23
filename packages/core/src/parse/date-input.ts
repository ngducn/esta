import { isIsoDate, type IsoDate } from '../date/iso-date';
import type { Result } from '../result';

export type DateInputReason = 'empty' | 'invalid' | 'impossible';

const DAY_MONTH_YEAR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

export function isoFromParts(year: string, month: string, day: string): Result<IsoDate, DateInputReason> {
  const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(candidate) ? { ok: true, value: candidate } : { ok: false, reason: 'impossible' };
}

/** Reads `dd/mm/yyyy` as typed in Vietnam; `.` and `-` also work as separators. */
export function parseDateInput(text: string): Result<IsoDate, DateInputReason> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const match = DAY_MONTH_YEAR.exec(trimmed);
  if (match === null) return { ok: false, reason: 'invalid' };
  const [, day = '', month = '', year = ''] = match;
  return isoFromParts(year, month, day);
}

/** A date field Mẹ may leave empty: empty is no date, and anything typed must be a day on the calendar. */
export function parseOptionalDateInput(text: string): Result<IsoDate | null, Exclude<DateInputReason, 'empty'>> {
  const parsed = parseDateInput(text);
  if (parsed.ok) return parsed;
  return parsed.reason === 'empty' ? { ok: true, value: null } : { ok: false, reason: parsed.reason };
}

export type PastDateReason = Exclude<DateInputReason, 'empty'> | 'after_today';

export function parsePastDateOrToday(text: string, today: IsoDate): Result<IsoDate, PastDateReason> {
  const parsed = parseOptionalDateInput(text);
  if (!parsed.ok) return parsed;
  const day = parsed.value ?? today;
  return day <= today ? { ok: true, value: day } : { ok: false, reason: 'after_today' };
}
