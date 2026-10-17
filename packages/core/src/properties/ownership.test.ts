import { describe, expect, it } from 'vitest';
import { bpToPercentText, formatShareBp, ownershipStatus, percentToBp } from './ownership';

describe('percentToBp', () => {
  it.each([
    ['33,33', 3333],
    ['33.33', 3333],
    ['33,3', 3330],
    ['50', 5000],
    [' 60 ', 6000],
    ['33,34 %', 3334],
    ['100', 10000],
    ['100,00', 10000],
    ['0,01', 1],
  ])('reads %s as %i bp', (text, bp) => {
    expect(percentToBp(text)).toEqual({ ok: true, value: bp });
  });

  it.each(['33,333', '1.000', '', 'abc', '-5', '50,', ',5', '1e2', '33,33,3'])('refuses %j as invalid', (text) => {
    expect(percentToBp(text)).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each(['100,01', '101', '0', '0,00', '999'])('refuses %s as out of range', (text) => {
    expect(percentToBp(text)).toEqual({ ok: false, reason: 'range' });
  });
});

describe('formatShareBp', () => {
  it('writes a Vietnamese decimal comma and trims trailing zeros', () => {
    expect(formatShareBp(3333, 'vi')).toBe('33,33%');
    expect(formatShareBp(5000, 'vi')).toBe('50%');
    expect(formatShareBp(3330, 'vi')).toBe('33,3%');
    expect(formatShareBp(10000, 'vi')).toBe('100%');
    expect(formatShareBp(3334, 'en')).toBe('33.34%');
  });

  it('round-trips through percentToBp in both languages', () => {
    for (const bp of [1, 999, 3333, 5000, 6667, 10000]) {
      expect(percentToBp(bpToPercentText(bp, 'vi'))).toEqual({ ok: true, value: bp });
      expect(percentToBp(bpToPercentText(bp, 'en'))).toEqual({ ok: true, value: bp });
    }
  });
});

describe('ownershipStatus', () => {
  const shares = (...bps: number[]) => bps.map((share_bp) => ({ share_bp }));

  it('is complete at exactly 10000 bp', () => {
    expect(ownershipStatus(shares(3333, 3333, 3334))).toEqual({ totalBp: 10000, state: 'complete' });
  });

  it('is under below 10000 bp, with no shares at all included', () => {
    expect(ownershipStatus(shares(6000, 3000))).toEqual({ totalBp: 9000, state: 'under' });
    expect(ownershipStatus([])).toEqual({ totalBp: 0, state: 'under' });
  });

  it('is over above 10000 bp', () => {
    expect(ownershipStatus(shares(7000, 4000))).toEqual({ totalBp: 11000, state: 'over' });
  });
});
