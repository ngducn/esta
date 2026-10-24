import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, fromEpochDay } from '../date/calendar';
import { formatBps, formatCount, formatDate, formatDayMonth, formatMonthYear, formatRelativeDue, formatVnd, formatVndCompact, type Locale } from '../format';
import { vnd } from '../money/vnd';
import { checkNumbers, collectAllowed, extractNumbers } from './index';

const locales = fc.constantFrom<Locale>('vi', 'en');
const amounts = fc.integer({ min: -9_999_999_999_999, max: 9_999_999_999_999 });
const dates = fc.integer({ min: 1_000, max: 40_000 }).map(fromEpochDay);
const read = (text: string, locale: Locale) => extractNumbers(text, locale).map((number) => number.value);

describe('every string the app formats reads back as the value it shows', () => {
  it('reads a full amount exactly', () => {
    fc.assert(
      fc.property(amounts, locales, (amount, locale) => {
        expect(read(formatVnd(vnd(amount), locale), locale)).toEqual([{ kind: 'amount', vnd: BigInt(amount) }]);
      }),
    );
  });

  it('reads a compact amount as one amount, which the same display string then allows', () => {
    fc.assert(
      fc.property(amounts, locales, (amount, locale) => {
        const shown = formatVndCompact(vnd(amount), locale);
        const [value] = read(shown, locale);
        expect(value?.kind).toBe('amount');
        expect(checkNumbers(shown, collectAllowed([{ amount_compact: shown }], { today: fromEpochDay(0), householdName: 'Gia đình Demo', locale }))).toEqual([]);
      }),
    );
  });

  it('reads counts, rates and dates exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999 }), fc.integer({ min: 0, max: 100_000 }), dates, locales, (count, bp, date, locale) => {
        expect(read(formatCount(count, locale), locale)).toEqual([{ kind: 'count', value: String(count) }]);
        expect(read(formatBps(bp, locale), locale)).toEqual([{ kind: 'ratio', bp: BigInt(bp) }]);
        expect(read(formatDate(date, locale), locale)).toEqual([{ kind: 'date', iso: date }]);
        expect(read(formatDayMonth(date, locale), locale)).toEqual([{ kind: 'date', iso: `--${date.slice(5)}` }]);
        expect(read(formatMonthYear(date, locale), locale)).toEqual([{ kind: 'date', iso: date.slice(0, 7) }]);
      }),
    );
  });

  it('reads a due phrase as its day count', () => {
    fc.assert(
      fc.property(dates, fc.integer({ min: -400, max: 400 }).filter((days) => days !== 0), locales, (today, days, locale) => {
        expect(read(formatRelativeDue(addDays(today, days), today, locale), locale)).toEqual([{ kind: 'count', value: String(Math.abs(days)) }]);
      }),
    );
  });
});
