import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { propertyStatus, type PropertyStatusFacts } from './status';

const asOf = isoDate('2026-10-07');
const rental = (facts: Partial<PropertyStatusFacts>): PropertyStatusFacts => ({ useMode: 'rental', vacantSince: null, leasedUnitCount: 0, unitCount: 1, ...facts });

describe('propertyStatus', () => {
  it.each([
    ['before', '2026-08-01'],
    ['on', '2026-10-07'],
  ])('marks a rental property vacant when a unit is available %s the date', (_, since) => {
    expect(propertyStatus(rental({ vacantSince: isoDate(since) }), asOf)).toEqual([{ kind: 'vacant', since }]);
  });

  it('shows no mark when the unit becomes available after the date', () => {
    expect(propertyStatus(rental({ vacantSince: isoDate('2026-10-08') }), asOf)).toEqual([]);
  });

  it('shows no mark for a rental property with no lease and no available date', () => {
    expect(propertyStatus(rental({}), asOf)).toEqual([]);
  });

  it('reads Dãy trọ Dĩ An as Đang cho thuê 6/8 beside Trống từ 01/08', () => {
    expect(propertyStatus(rental({ leasedUnitCount: 6, unitCount: 8, vacantSince: isoDate('2026-08-01') }), asOf)).toEqual([
      { kind: 'leased', leased: 6, total: 8 },
      { kind: 'vacant', since: '2026-08-01' },
    ]);
  });

  it('marks a fully let property leased and nothing else', () => {
    expect(propertyStatus(rental({ leasedUnitCount: 1, unitCount: 1 }), asOf)).toEqual([{ kind: 'leased', leased: 1, total: 1 }]);
  });

  it.each(['owner_occupied', 'family_use', 'own_business', 'held', 'under_renovation'] as const)(
    'shows no mark for %s, whose pill already says what it is',
    (useMode) => {
      expect(propertyStatus({ useMode, vacantSince: isoDate('2026-08-01'), leasedUnitCount: 1, unitCount: 2 }, asOf)).toEqual([]);
    },
  );
});
