import { describe, expect, it } from 'vitest';
import { purposesMismatch, sumLandArea } from './area';

describe('sumLandArea (PRP-2)', () => {
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
