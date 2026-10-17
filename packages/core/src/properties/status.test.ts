import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { propertyStatus } from './status';

const asOf = isoDate('2026-10-07');

describe('propertyStatus', () => {
  it.each([
    ['before', '2026-08-01'],
    ['on', '2026-10-07'],
  ])('marks a rental property vacant when a unit is available %s the date', (_, since) => {
    expect(propertyStatus({ useMode: 'rental', vacantSince: isoDate(since) }, asOf)).toEqual({ kind: 'vacant', since });
  });

  it('shows no mark when the unit becomes available after the date', () => {
    expect(propertyStatus({ useMode: 'rental', vacantSince: isoDate('2026-10-08') }, asOf)).toBeNull();
  });

  it('shows no mark for a rental property with no available date', () => {
    expect(propertyStatus({ useMode: 'rental', vacantSince: null }, asOf)).toBeNull();
  });

  it.each(['owner_occupied', 'family_use', 'own_business', 'held', 'under_renovation'] as const)(
    'shows no mark for %s, whose pill already says what it is',
    (useMode) => {
      expect(propertyStatus({ useMode, vacantSince: isoDate('2026-08-01') }, asOf)).toBeNull();
    },
  );
});
