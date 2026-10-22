import { addMonths, dateParts, daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';

export type ValuationAge = { readonly months: number; readonly days: number };

/**
 * How old a valuation dated `asOf` is on `today`, in whole calendar months and the days after them, for `cách đây N
 * tháng`. A month is reached on the same day of the month, or on the last day of a shorter month: 31/08 to 30/09 is
 * one month. A valuation dated after `today` is zero old.
 */
export function valuationAge(asOf: IsoDate, today: IsoDate): ValuationAge {
  if (today <= asOf) return { months: 0, days: 0 };
  const from = dateParts(asOf);
  const to = dateParts(today);
  const guess = (to.year - from.year) * 12 + (to.month - from.month);
  const months = addMonths(asOf, guess) <= today ? guess : guess - 1;
  return { months, days: daysBetween(addMonths(asOf, months), today) };
}
