import type { IsoDate } from './iso-date';

export type DateParts = { year: number; month: number; day: number };

export function dateParts(date: IsoDate): DateParts {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

// Days since 1970-01-01 in the proleptic Gregorian calendar (Hinnant's days_from_civil).
// Pure arithmetic, so the result never depends on the host time zone.
export function epochDay(date: IsoDate): number {
  const { year, month, day } = dateParts(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(date: IsoDate): number {
  return (((epochDay(date) + 4) % 7) + 7) % 7;
}
