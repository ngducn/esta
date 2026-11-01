import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { propertyTotals } from './totals';

const row = (fields: Partial<Parameters<typeof propertyTotals>[0][number]>) => ({ statusKeys: [], leasedUnitCount: 0, unitCount: 1, monthlyRentVnd: null, ...fields });

describe('propertyTotals', () => {
  it('adds the rents in effect, the units let and the properties that need attention', () => {
    const totals = propertyTotals([
      row({ statusKeys: ['attention'], leasedUnitCount: 6, unitCount: 8, monthlyRentVnd: vnd(15_600_000) }),
      row({ statusKeys: ['vacant'], leasedUnitCount: 1, unitCount: 1, monthlyRentVnd: vnd(9_000_000) }),
      row({}),
    ], true);
    expect(totals).toEqual({ attention: 1, leasedUnits: 7, units: 10, rentVnd: 24_600_000 });
  });

  it('counts attention and vacant apart', () => {
    const totals = propertyTotals([row({ statusKeys: ['attention'] }), row({ statusKeys: ['vacant'] }), row({ statusKeys: ['vacant'] }), row({ statusKeys: ['attention', 'vacant'] })], true);
    expect(totals.attention).toBe(2);
  });

  it('leaves attention unknown, not zero, when the bills could not be read', () => {
    expect(propertyTotals([row({}), row({})], false).attention).toBeNull();
  });

  it('keeps rent unknown, not zero, when no lease is in effect', () => {
    expect(propertyTotals([row({}), row({})], true).rentVnd).toBeNull();
    expect(propertyTotals([], true).rentVnd).toBeNull();
  });
});
