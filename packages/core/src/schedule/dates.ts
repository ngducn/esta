import { dateParts, epochDay } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function fromParts(year: number, month: number, day: number): IsoDate {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

export function firstOfMonth(date: IsoDate): IsoDate {
  const { year, month } = dateParts(date);
  return fromParts(year, month, 1);
}

/** Keeps the day of month, clamped to the last day of the target month. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = dateParts(date);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return fromParts(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

const YEARS_PER_ERA = 400;
const DAYS_PER_ERA = 146_097;
const DAYS_FROM_MARCH_YEAR_0_TO_UNIX_EPOCH = 719_468;

export function fromEpochDay(epoch: number): IsoDate {
  const z = epoch + DAYS_FROM_MARCH_YEAR_0_TO_UNIX_EPOCH;
  const era = Math.floor(z / DAYS_PER_ERA);
  const dayOfEra = z - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthsSinceMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthsSinceMarch + 2) / 5) + 1;
  const month = monthsSinceMarch < 10 ? monthsSinceMarch + 3 : monthsSinceMarch - 9;
  const year = yearOfEra + era * YEARS_PER_ERA + (month <= 2 ? 1 : 0);
  return fromParts(year, month, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(date) + days);
}

/** The largest n with addMonths(from, n) on or before to. Negative when to is before from. */
export function monthsUntil(from: IsoDate, to: IsoDate): number {
  const a = dateParts(from);
  const b = dateParts(to);
  const candidate = (b.year - a.year) * 12 + (b.month - a.month);
  return addMonths(from, candidate) <= to ? candidate : candidate - 1;
}
