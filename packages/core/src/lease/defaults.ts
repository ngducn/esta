import type { PropertyKind } from '../properties/kinds';
import type { UnitKind } from '../schemas/units';
import type { BillingCycleMonths, FirstPeriodProration, PeriodAnchor } from '../schedule/types';
import { vnd, type Vnd } from '../money/vnd';
import type { TaxPayer, UtilitiesMode } from './types';

export type LeaseDefaultKey = 'room' | 'apartment' | 'whole' | 'floor' | 'shop' | 'lot';

export type LeaseDefault = {
  readonly billingCycleMonths: BillingCycleMonths;
  readonly depositMonths: number;
  readonly periodAnchor: PeriodAnchor;
  readonly firstPeriodProration: FirstPeriodProration;
  readonly dueOffsetDays: number;
  readonly utilitiesMode: UtilitiesMode;
  readonly taxPayer: TaxPayer;
  readonly noticeDays: number;
};

const common = { firstPeriodProration: 'by_days', dueOffsetDays: 0, taxPayer: 'owner', noticeDays: 30 } as const;

/**
 * DOMAIN-VN §7 as data. A room bills from the move-in day each month, as rooming houses do, so its anchor is the lease
 * start; every other unit bills by calendar month, prorating a first month that starts mid-month.
 */
export const LEASE_DEFAULTS = {
  room: { ...common, billingCycleMonths: 1, depositMonths: 1, periodAnchor: 'lease_start', utilitiesMode: 'metered_by_owner' },
  apartment: { ...common, billingCycleMonths: 1, depositMonths: 2, periodAnchor: 'calendar_month', utilitiesMode: 'tenant_direct' },
  whole: { ...common, billingCycleMonths: 3, depositMonths: 2, periodAnchor: 'calendar_month', utilitiesMode: 'tenant_direct' },
  shop: { ...common, billingCycleMonths: 3, depositMonths: 2, periodAnchor: 'calendar_month', utilitiesMode: 'tenant_direct' },
  floor: { ...common, billingCycleMonths: 1, depositMonths: 2, periodAnchor: 'calendar_month', utilitiesMode: 'metered_by_owner' },
  lot: { ...common, billingCycleMonths: 12, depositMonths: 3, periodAnchor: 'calendar_month', utilitiesMode: 'tenant_direct' },
} as const satisfies Record<LeaseDefaultKey, LeaseDefault>;

/** An apartment is let whole, so its `whole` unit takes the apartment terms rather than a house's. */
export function leaseDefaultKey(unitKind: UnitKind, propertyKind: PropertyKind): LeaseDefaultKey {
  return unitKind === 'whole' && propertyKind === 'apartment' ? 'apartment' : unitKind;
}

export type LeaseFormDefaults = LeaseDefault & { readonly rentVnd: Vnd | null; readonly depositVnd: Vnd | null };

/** Rent starts at the unit's list rent and the deposit at that rent times the deposit months. */
export function leaseDefaults(unit: { readonly kind: UnitKind; readonly list_rent_vnd: Vnd | null }, propertyKind: PropertyKind): LeaseFormDefaults {
  const terms = LEASE_DEFAULTS[leaseDefaultKey(unit.kind, propertyKind)];
  const rent = unit.list_rent_vnd;
  return { ...terms, rentVnd: rent, depositVnd: rent === null ? null : vnd(rent * terms.depositMonths) };
}
