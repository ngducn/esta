import { LEASE_DEFAULTS } from '@esta/core/lease';
import { expect } from 'vitest';
import { e2eServiceHeaders } from '../../../../scripts/e2e-service.ts';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';
import { env } from './connector';

export const PAID_THROUGH = '2026-09-30';

export const room = (label: string) => ({ label, kind: 'room', area_m2: 18, list_rent_vnd: 3_500_000, available_from: null });

/** Chị Lan Demo's room from 01/03/2026 at 9.000.000 ₫ with two months' deposit, LEASE_DEFAULTS for a room otherwise, as Claude fills it. */
export const draft = (unitId: unknown, tenantId: unknown) => {
  const terms = LEASE_DEFAULTS.room;
  return {
    unit_id: unitId,
    tenant_party_id: tenantId,
    start_date: '2026-03-01',
    end_date: null,
    rent_vnd: 9_000_000,
    deposit_vnd: 18_000_000,
    escalation: { kind: 'none' },
    billing_cycle_months: terms.billingCycleMonths,
    period_anchor: terms.periodAnchor,
    first_period_proration: terms.firstPeriodProration,
    utilities_mode: terms.utilitiesMode,
    tax_payer: terms.taxPayer,
    notice_days: terms.noticeDays,
  };
};
export const deposit = (leaseId: unknown) => ({ lease_id: leaseId, kind: 'received', amount_vnd: 18_000_000, on_date: '2026-03-01', note: null });
/** A room on `propertyId` let to Lan Demo, started paid through September, with her deposit: five items in one batch. */
export const rental = (propertyId: string, label: string, phone: string) => [
  { op: 'unit.create', ref: 'room', input: { property_id: propertyId, unit: room(label) } },
  { op: 'person.create', ref: 'lan', input: { person: { full_name: 'Lan Demo', phone, id_last4: null } } },
  { op: 'lease.create', ref: 'lease', input: { property_id: propertyId, lease: draft({ $ref: 'room' }, { $ref: 'lan' }) } },
  { op: 'lease.activate', input: { lease_id: { $ref: 'lease' }, paid_through: PAID_THROUGH } },
  { op: 'deposit.record', input: deposit({ $ref: 'lease' }) },
];

/** The nightly invoicing for one lane's household alone, as the cron route runs it with the service role. */
export async function nightlyRun(lane: number, asOf: string) {
  const response = await fetch(`${env.ESTA_IT_SUPABASE_URL}/rest/v1/rpc/run_invoicing`, {
    method: 'POST',
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ p_household_id: seedId(`seed:household:lane-${lane}`), p_as_of: asOf, p_issued_at: `${asOf}T00:30:00+07:00` }),
  });
  expect(response.ok, await response.text()).toBe(true);
}
