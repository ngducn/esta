import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { documentExpiry, expiringSoon } from './expiry';

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

describe('expiringSoon', () => {
  const doc = (id: string, expiresOn: string | null) => ({ id, expiresOn: expiresOn === null ? null : isoDate(expiresOn) });

  it('lists the q7 insurance at 23 days on 2026-10-07 (DOC-7)', () => {
    expect(expiringSoon([doc('q7-insurance', '2026-10-30')], today)).toEqual([{ document: doc('q7-insurance', '2026-10-30'), days: 23 }]);
  });

  it('includes 30 days and excludes 31, an expired document and one with no date', () => {
    const listed = expiringSoon([doc('thirty', '2026-11-06'), doc('thirty-one', '2026-11-07'), doc('expired', '2026-10-06'), doc('none', null)], today);
    expect(listed.map(({ document, days }) => [document.id, days])).toEqual([['thirty', 30]]);
  });

  it('orders by date, soonest first, with today first of all', () => {
    const listed = expiringSoon([doc('late', '2026-11-01'), doc('today', '2026-10-07'), doc('soon', '2026-10-12')], today);
    expect(listed.map(({ document, days }) => [document.id, days])).toEqual([
      ['today', 0],
      ['soon', 5],
      ['late', 25],
    ]);
  });
});
