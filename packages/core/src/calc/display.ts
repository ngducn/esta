import { formatBps, formatCount, formatDate, formatDays, formatVnd, type Locale } from '../format';
import type { TypedValue } from './types';

function monthsLabel(months: number, locale: Locale): string {
  if (locale === 'vi') return 'tháng';
  return Math.abs(months) === 1 ? 'month' : 'months';
}

export function displayTyped(value: TypedValue, locale: Locale): string {
  switch (value.kind) {
    case 'vnd':
      return formatVnd(value.value, locale);
    case 'bp':
      return value.per === 'month' ? `${formatBps(value.value, locale)}${locale === 'vi' ? '/tháng' : '/month'}` : formatBps(value.value, locale);
    case 'count':
      return value.unit === 'days' ? formatDays(value.value, locale) : `${formatCount(value.value, locale)} ${value.unit}`;
    case 'months':
      return `${formatCount(value.value, locale)} ${monthsLabel(value.value, locale)}`;
    case 'date':
      return formatDate(value.value, locale);
  }
}
