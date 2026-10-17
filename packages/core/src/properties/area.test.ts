import { describe, expect, it } from 'vitest';
import { parseAreaInput, purposesMismatch, sumLandArea } from './area';

describe('parseAreaInput', () => {
  it.each([
    ['350,5', 350.5],
    ['350.5', 350.5],
    ['80,25 m²', 80.25],
    ['150m2', 150],
    ['1.250,75', 1250.75],
    ['1.250', 1250],
    [' 12 ', 12],
  ])('reads %s as %d m²', (text, expected) => {
    expect(parseAreaInput(text)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['120,555', 'too_precise'],
    ['0', 'invalid'],
    ['-5', 'invalid'],
    ['12,5,5', 'invalid'],
    ['abc', 'invalid'],
    ['99999999999', 'too_large'],
  ])('refuses %j as %s', (text, reason) => {
    expect(parseAreaInput(text)).toEqual({ ok: false, reason });
  });
});

describe('sumLandArea', () => {
  it('sums 120,5 and 80,25 to exactly 200,75', () => {
    expect(sumLandArea([{ area_m2: 120.5 }, { area_m2: 80.25 }])).toBe(200.75);
  });

  it('sums hundredths that floats would drift on', () => {
    expect(sumLandArea([{ area_m2: 0.1 }, { area_m2: 0.2 }])).toBe(0.3);
  });

  it('sums an empty list to 0 and skips a parcel with no area', () => {
    expect(sumLandArea([])).toBe(0);
    expect(sumLandArea([{ area_m2: null }, { area_m2: 150 }])).toBe(150);
  });
});

describe('purposesMismatch', () => {
  it('returns both totals when the purposes do not add up to the parcel', () => {
    expect(purposesMismatch({ area_m2: 80, purposes: [{ area_m2: 80 }, { area_m2: 20.5 }, { area_m2: 10 }] })).toEqual({ parcel: 80, purposes: 110.5 });
  });

  it('returns null when they match, when the parcel has no area and when no purpose carries one', () => {
    expect(purposesMismatch({ area_m2: 100.3, purposes: [{ area_m2: 100.1 }, { area_m2: 0.2 }] })).toBeNull();
    expect(purposesMismatch({ area_m2: null, purposes: [{ area_m2: 10 }] })).toBeNull();
    expect(purposesMismatch({ area_m2: 80, purposes: [{}] })).toBeNull();
  });
});
