import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { valuationAge } from './age';

const age = (asOf: string, today: string) => valuationAge(isoDate(asOf), isoDate(today));

describe('valuationAge', () => {
  it('is zero on the same day', () => {
    expect(age('2026-10-07', '2026-10-07')).toEqual({ months: 0, days: 0 });
  });

  it('counts days before the first month is reached', () => {
    expect(age('2026-09-08', '2026-10-07')).toEqual({ months: 0, days: 29 });
  });

  it('reaches a month on the same day of the next month', () => {
    expect(age('2026-09-07', '2026-10-07')).toEqual({ months: 1, days: 0 });
    expect(age('2026-07-01', '2026-10-07')).toEqual({ months: 3, days: 6 });
  });

  it('reaches a month from the 31st on the 30th of a shorter month', () => {
    expect(age('2026-08-31', '2026-09-30')).toEqual({ months: 1, days: 0 });
    expect(age('2026-08-31', '2026-09-29')).toEqual({ months: 0, days: 29 });
  });

  it('counts across a year end and a leap day', () => {
    expect(age('2023-02-28', '2024-02-29')).toEqual({ months: 12, days: 1 });
    expect(age('2025-11-15', '2026-10-07')).toEqual({ months: 10, days: 22 });
  });

  it('is zero for a date after today', () => {
    expect(age('2026-10-08', '2026-10-07')).toEqual({ months: 0, days: 0 });
  });
});
