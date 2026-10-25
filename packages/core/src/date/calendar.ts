import { daysInMonth, type IsoDate } from './iso-date';

export type DateParts = { year: number; month: number; day: number };

export function dateParts(date: IsoDate): DateParts {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

function fromParts(year: number, month: number, day: number): IsoDate {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

const YEARS_PER_ERA = 400;
const DAYS_PER_ERA = 146_097;
const DAYS_FROM_MARCH_YEAR_0_TO_UNIX_EPOCH = 719_468;

function daysBeforeMonthInMarchYear(month: number): number {
  const monthsSinceMarch = (month + 9) % 12;
  return Math.floor((153 * monthsSinceMarch + 2) / 5);
}

export function epochDay(date: IsoDate): number {
  const { year, month, day } = dateParts(date);
  const marchYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(marchYear / YEARS_PER_ERA);
  const yearOfEra = marchYear - era * YEARS_PER_ERA;
  const dayOfYear = daysBeforeMonthInMarchYear(month) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_MARCH_YEAR_0_TO_UNIX_EPOCH;
}

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

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(date) + days);
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

/** 0 is Sunday, 6 is Saturday. */
export function weekday(date: IsoDate): number {
  return (((epochDay(date) + 4) % 7) + 7) % 7;
}

/** The ISO 8601 week that holds `date`, as `2026-W41`: weeks run Monday to Sunday and belong to the year of their Thursday. */
export function isoWeek(date: IsoDate): string {
  const thursday = epochDay(date) - ((weekday(date) + 6) % 7) + 3;
  const { year } = dateParts(fromEpochDay(thursday));
  const week = Math.floor((thursday - epochDay(fromParts(year, 1, 1))) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Sunday that ends an ISO week written as `isoWeek` writes it: week 1 is the one that holds 4 January. */
export function isoWeekSunday(week: string): IsoDate {
  const january4 = fromParts(Number(week.slice(0, 4)), 1, 4);
  const monday = epochDay(january4) - ((weekday(january4) + 6) % 7);
  return fromEpochDay(monday + 7 * (Number(week.slice(6)) - 1) + 6);
}
