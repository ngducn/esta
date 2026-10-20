import type { Page } from '@playwright/test';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { memberRest } from './auth-api';
import { laneHousehold, laneProperty } from './seed';

export type FreshTerms = { start: string; end: string; rent: number; paidThrough: string };

/**
 * An active monthly lease on a room no lease has touched, named as `Thêm phòng` would name it, for the Phòng 7 tenant.
 * It is drafted and activated through the session like any member's lease, so its invoices are what activation issues.
 */
export async function freshLease(page: Page, lane: number, terms: FreshTerms): Promise<{ id: string; label: string; path: string }> {
  const property = laneProperty(lane, 'di-an');
  const units = await memberRest<{ label: string }[]>(page, 'GET', `units?property_id=eq.${property}&select=label`);
  const label = `Phòng ${Math.max(...units.map((unit) => Number(/^Phòng (\d+)$/.exec(unit.label)?.[1] ?? 0))) + 1}`;
  const [unit] = await memberRest<{ id: string }[]>(page, 'POST', 'units', { household_id: laneHousehold(lane), property_id: property, label, kind: 'room', list_rent_vnd: terms.rent });
  const [lease] = await memberRest<{ id: string }[]>(page, 'POST', 'leases', {
    household_id: laneHousehold(lane),
    property_id: property,
    unit_id: unit?.id,
    tenant_party_id: seedId(`seed:party:tenant-lane-${lane}:di-an:7`),
    start_date: terms.start,
    end_date: terms.end,
    rent_vnd: terms.rent,
    deposit_vnd: terms.rent,
  });
  const id = lease?.id ?? '';
  await memberRest(page, 'POST', 'rpc/activate_lease', { p_lease_id: id, p_paid_through: terms.paidThrough });
  return { id, label, path: `/properties/${property}/rental/leases/${id}` };
}
