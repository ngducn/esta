import { addMonths, dateParts, daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';

export type ValuationAge = { readonly months: number; readonly days: number };

export function valuationAge(asOf: IsoDate, today: IsoDate): ValuationAge {
  if (today <= asOf) return { months: 0, days: 0 };
  const from = dateParts(asOf);
  const to = dateParts(today);
  const guess = (to.year - from.year) * 12 + (to.month - from.month);
  const months = addMonths(asOf, guess) <= today ? guess : guess - 1;
  return { months, days: daysBetween(addMonths(asOf, months), today) };
}
