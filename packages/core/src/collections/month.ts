import { isIsoDate, type IsoDate } from '../date/iso-date';
import { firstOfMonth } from '../date/calendar';

/** `?month=2026-10` names the board's month; anything else falls back to the Clock's month. */
export function parseBoardMonth(param: string | undefined, today: IsoDate): IsoDate {
  const text = `${param ?? ''}-01`;
  return /^\d{4}-\d{2}-01$/.test(text) && isIsoDate(text) ? text : firstOfMonth(today);
}

export function boardMonthParam(month: IsoDate): string {
  return month.slice(0, 7);
}
