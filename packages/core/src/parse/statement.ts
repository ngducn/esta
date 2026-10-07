import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { Result } from '../result';
import { parseDecimal, toSafeNumber, toWholeDong, type AmountReason } from './decimal';
import { isoFromParts, type DateInputReason } from './date-input';

const SIGNED_AMOUNT = /^([+-]?)\s*([\d.,]+)\s*(?:vnd|₫|đ)?$/i;

/** One amount cell from a bank statement, signed, as whole đồng. */
export function parseStatementAmount(text: string): Result<Vnd, AmountReason> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const match = SIGNED_AMOUNT.exec(trimmed);
  const amount = match === null ? null : parseDecimal(match[2] ?? '');
  if (match === null || amount === null) return { ok: false, reason: 'invalid' };
  const whole = toWholeDong(amount, match[1] === '-' ? -1n : 1n);
  if (!whole.ok) return whole;
  const safe = toSafeNumber(whole.value);
  return safe.ok ? { ok: true, value: vnd(safe.value) } : safe;
}

const TIME = '(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d';
const DAY_FIRST = new RegExp(`^(\\d{2})/(\\d{2})/(\\d{4})(?: ${TIME})?$`);
const YEAR_FIRST = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss` or `yyyy-MM-dd`; the time of day is dropped. */
export function parseStatementDate(text: string): Result<IsoDate, DateInputReason> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst !== null) return isoFromParts(dayFirst[3] ?? '', dayFirst[2] ?? '', dayFirst[1] ?? '');
  const yearFirst = YEAR_FIRST.exec(trimmed);
  if (yearFirst !== null) return isoFromParts(yearFirst[1] ?? '', yearFirst[2] ?? '', yearFirst[3] ?? '');
  return { ok: false, reason: 'invalid' };
}
