import { formatBps, formatCount, formatDate, formatVnd, type Locale } from '../format';
import type { TypedValue } from './types';

const UNIT_MONTHS: Record<Locale, string> = { vi: 'tháng', en: 'months' };

export function displayTyped(value: TypedValue, locale: Locale): string {
  switch (value.kind) {
    case 'vnd':
      return formatVnd(value.value, locale);
    case 'bp':
      return formatBps(value.value, locale);
    case 'count':
      return `${formatCount(value.value, locale)} ${value.unit}`;
    case 'months':
      return `${formatCount(value.value, locale)} ${UNIT_MONTHS[locale]}`;
    case 'date':
      return formatDate(value.value, locale);
  }
}
