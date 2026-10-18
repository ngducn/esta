import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { documentExpiry } from './expiry';

const today = isoDate('2026-10-07');

describe('documentExpiry', () => {
  it('counts the q7 insurance down from 23 days on 2026-10-07', () => {
    expect(documentExpiry(isoDate('2026-10-30'), today)).toEqual({ state: 'expires_in', days: 23 });
  });

  it('counts down at 30 days and stays quiet at 31', () => {
    expect(documentExpiry(isoDate('2026-11-06'), today)).toEqual({ state: 'expires_in', days: 30 });
    expect(documentExpiry(isoDate('2026-11-07'), today)).toEqual({ state: 'none' });
  });

  it('reads 0 days on the last day and expired the day after', () => {
    expect(documentExpiry(today, today)).toEqual({ state: 'expires_in', days: 0 });
    expect(documentExpiry(isoDate('2026-10-06'), today)).toEqual({ state: 'expired' });
  });

  it('has nothing to say without a date', () => {
    expect(documentExpiry(null, today)).toEqual({ state: 'none' });
  });
});
