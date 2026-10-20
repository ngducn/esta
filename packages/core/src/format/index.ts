import { dateParts, daysBetween, weekday } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';

export type Locale = 'vi' | 'en';

const NBSP = '\u00a0';

const vndCurrency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const enInteger = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatVnd(amount: Vnd, locale: Locale): string {
  return locale === 'vi' ? vndCurrency.format(amount) : `${enInteger.format(amount)}${NBSP}₫`;
}

type CompactUnit = { size: number; decimals: number; vi: string; en: string };

const COMPACT_UNITS: readonly CompactUnit[] = [
  { size: 1_000_000_000, decimals: 2, vi: 'tỷ', en: 'B' },
  { size: 1_000_000, decimals: 1, vi: 'tr', en: 'M' },
  { size: 1_000, decimals: 0, vi: 'nghìn', en: 'K' },
];

const decimalFormats: Record<Locale, readonly Intl.NumberFormat[]> = {
  vi: [0, 1, 2].map((d) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d })),
  en: [0, 1, 2].map((d) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d })),
};

function formatDecimal(value: number, decimals: number, locale: Locale): string {
  const format = decimalFormats[locale][decimals];
  if (format === undefined) throw new RangeError(`Unsupported decimals: ${decimals}`);
  return format.format(value);
}

export function formatVndCompact(amount: Vnd, locale: Locale): string {
  const magnitude = Math.abs(amount);
  const sign = amount < 0 ? -1 : 1;
  for (const unit of COMPACT_UNITS) {
    const step = unit.size / 10 ** unit.decimals;
    const steps = Math.round(magnitude / step);
    if (steps * step < unit.size) continue;
    const number = formatDecimal((sign * steps) / 10 ** unit.decimals, unit.decimals, locale);
    return locale === 'vi' ? `${number} ${unit.vi}` : `${number}${unit.en} ₫`;
  }
  return formatVnd(amount, locale);
}

export function formatArea(squareMeters: number, locale: Locale): string {
  return `${formatDecimal(squareMeters, 2, locale)} m²`;
}

export function formatDate(date: IsoDate, _locale: Locale): string {
  const { year, month, day } = dateParts(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** `25/09/2026 – 24/10/2026`, a billing period as a receipt and a reminder print it. */
export function formatDateRange(start: IsoDate, end: IsoDate, locale: Locale): string {
  return `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
}

/** `01/08`, for a date the reader places in the current year, such as the `Trống từ 01/08` mark. */
export function formatDayMonth(date: IsoDate, locale: Locale): string {
  return formatDate(date, locale).slice(0, 5);
}

const WEEKDAYS: Record<Locale, readonly string[]> = {
  vi: ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export function formatDateLong(date: IsoDate, locale: Locale): string {
  return `${WEEKDAYS[locale][weekday(date)]}, ${formatDate(date, locale)}`;
}

export function formatRelativeDue(due: IsoDate, today: IsoDate, locale: Locale): string {
  const days = daysBetween(today, due);
  if (locale === 'vi') {
    if (days < 0) return `quá hạn ${-days} ngày`;
    return days === 0 ? 'đến hạn hôm nay' : `còn ${days} ngày`;
  }
  const count = `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`;
  if (days < 0) return `${count} overdue`;
  return days === 0 ? 'due today' : `due in ${count}`;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** `10/2026` (read after `tháng`) or `October 2026`, for the month that holds `date`. */
export function formatMonthYear(date: IsoDate, locale: Locale): string {
  const { year, month } = dateParts(date);
  return locale === 'vi' ? `${month}/${year}` : `${MONTHS_EN[month - 1] ?? ''} ${year}`;
}

/** `9` or `September` inside `context`'s year, else with the year, as in the carry marker `từ tháng 12/2025`. */
export function formatMonthWithin(date: IsoDate, context: IsoDate, locale: Locale): string {
  if (date.slice(0, 4) !== context.slice(0, 4)) return formatMonthYear(date, locale);
  const { month } = dateParts(date);
  return locale === 'vi' ? String(month) : (MONTHS_EN[month - 1] ?? '');
}
export { vndInWords } from './words';
