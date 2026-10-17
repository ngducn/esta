import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { daysBetween, epochDay } from '../date/calendar';
import { isoDate } from '../date/iso-date';
import { addDays, addMonths, firstOfMonth, fromEpochDay, monthsUntil } from './dates';

const d = isoDate;
const params = { seed: 20261007, numRuns: 1000 };
const anyDate = fc
  .date({ min: new Date('1900-01-01T00:00:00Z'), max: new Date('2199-12-31T00:00:00Z'), noInvalidDate: true })
  .map((date) => isoDate(date.toISOString().slice(0, 10)));

describe('addMonths', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 48, '2028-02-29'],
    ['2026-01-25', 1, '2026-02-25'],
    ['2026-11-15', 3, '2027-02-15'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-01-15', -13, '2024-12-15'],
  ])('%s plus %i months is %s', (from, months, to) => {
    expect(addMonths(d(from), months)).toBe(to);
  });
});

describe('addDays and fromEpochDay', () => {
  it.each([
    ['2026-02-28', 1, '2026-03-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-10-01', 35, '2026-11-05'],
  ])('%s plus %i days is %s', (from, days, to) => {
    expect(addDays(d(from), days)).toBe(to);
  });

  it('inverts epochDay on every date from 1900 to 2199', () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(fromEpochDay(epochDay(date))).toBe(date);
      }),
      params,
    );
  });

  it('moves by exactly the given number of days', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -40_000, max: 40_000 }), (date, days) => {
        expect(daysBetween(date, addDays(date, days))).toBe(days);
      }),
      params,
    );
  });
});

describe('firstOfMonth and monthsUntil', () => {
  it('returns the first day of the same month', () => {
    expect(firstOfMonth(d('2026-07-15'))).toBe('2026-07-01');
    expect(firstOfMonth(d('2026-07-01'))).toBe('2026-07-01');
  });

  it.each([
    ['2026-07-15', '2027-07-01', 11],
    ['2026-07-15', '2027-07-15', 12],
    ['2026-07-15', '2027-08-01', 12],
    ['2026-07-01', '2027-07-01', 12],
    ['2024-02-29', '2025-02-28', 12],
    ['2026-01-31', '2026-02-28', 1],
    ['2026-01-31', '2026-02-27', 0],
    ['2026-03-10', '2026-03-09', -1],
  ])('from %s to %s is %i whole months', (from, to, months) => {
    expect(monthsUntil(d(from), d(to))).toBe(months);
  });

  it('is the largest n whose anniversary is on or before the target', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 20_000 }), (from, days) => {
        const to = addDays(from, days);
        const n = monthsUntil(from, to);
        expect(addMonths(from, n) <= to).toBe(true);
        expect(addMonths(from, n + 1) > to).toBe(true);
      }),
      params,
    );
  });
});
