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
