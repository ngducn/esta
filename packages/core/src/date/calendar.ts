import type { IsoDate } from './iso-date';

export type DateParts = { year: number; month: number; day: number };

export function dateParts(date: IsoDate): DateParts {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
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

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(date: IsoDate): number {
  return (((epochDay(date) + 4) % 7) + 7) % 7;
}
