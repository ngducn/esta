import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { UNIT_KINDS } from '../schemas/units';
import { LEASE_DEFAULTS, leaseDefaultKey, leaseDefaults } from './defaults';

describe('LEASE_DEFAULTS (DOMAIN-VN §7)', () => {
  it('has a row for every unit kind and for apartments', () => {
    expect(Object.keys(LEASE_DEFAULTS).toSorted()).toEqual([...UNIT_KINDS, 'apartment'].toSorted());
  });

  it.each([
    ['room', 1, 1, 'metered_by_owner', 'lease_start'],
    ['apartment', 1, 2, 'tenant_direct', 'calendar_month'],
    ['whole', 3, 2, 'tenant_direct', 'calendar_month'],
    ['shop', 3, 2, 'tenant_direct', 'calendar_month'],
    ['floor', 1, 2, 'metered_by_owner', 'calendar_month'],
    ['lot', 12, 3, 'tenant_direct', 'calendar_month'],
  ] as const)('%s bills every %i months with a %i month deposit, %s, anchored on %s', (key, cycle, deposit, utilities, anchor) => {
    expect(LEASE_DEFAULTS[key]).toEqual({
      billingCycleMonths: cycle,
      depositMonths: deposit,
      periodAnchor: anchor,
      firstPeriodProration: 'by_days',
      dueOffsetDays: 0,
      utilitiesMode: utilities,
      taxPayer: 'owner',
      noticeDays: 30,
    });
  });

  it('reads the whole unit of an apartment as an apartment and of a warehouse as a whole house', () => {
    expect(leaseDefaultKey('whole', 'apartment')).toBe('apartment');
    expect(leaseDefaultKey('whole', 'warehouse')).toBe('whole');
    expect(leaseDefaultKey('room', 'rooming_house')).toBe('room');
  });

  it('starts rent at the list rent and the deposit at that rent times the deposit months', () => {
    expect(leaseDefaults({ kind: 'room', list_rent_vnd: vnd(3_000_000) }, 'rooming_house')).toMatchObject({ rentVnd: 3_000_000, depositVnd: 3_000_000 });
    expect(leaseDefaults({ kind: 'whole', list_rent_vnd: vnd(12_000_000) }, 'warehouse')).toMatchObject({ rentVnd: 12_000_000, depositVnd: 24_000_000, billingCycleMonths: 3 });
    expect(leaseDefaults({ kind: 'shop', list_rent_vnd: null }, 'commercial_space')).toMatchObject({ rentVnd: null, depositVnd: null });
  });
});
