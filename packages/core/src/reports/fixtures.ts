import type { IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { leaseRowSchema } from '../schemas/lease';
import type { ReportLease, ReportSnapshot } from './snapshot';

let next = 0;

/** For tests: a fresh uuid, counted up. */
export const testUuid = () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;

/** For tests: a monthly lease in effect on a room of `Dãy trọ Dĩ An Demo`, overridden by `values` (row columns) and `extra`. */
export const reportLease = (propertyId: string, unitLabel: string, values: Record<string, unknown> = {}, extra: Partial<ReportLease> = {}): ReportLease => ({
  ...leaseRowSchema.parse({
    id: testUuid(),
    property_id: propertyId,
    unit_id: testUuid(),
    tenant_party_id: null,
    start_date: '2025-11-01',
    end_date: null,
    rent_vnd: 3_000_000,
    billing_cycle_months: 1,
    period_anchor: 'calendar_month',
    first_period_proration: 'none',
    due_offset_days: 0,
    deposit_vnd: 3_000_000,
    escalation: { kind: 'none' },
    utilities_mode: 'metered_by_owner',
    tax_payer: 'owner',
    notice_days: 30,
    paid_through_date: null,
    status: 'active',
    terminated_on: null,
    termination_reason: null,
    renewal_of_lease_id: null,
    ...values,
  }),
  propertyName: 'Dãy trọ Dĩ An Demo',
  unitLabel,
  wholeUnit: false,
  tenantName: `Người thuê ${unitLabel} Demo`,
  depositHeldVnd: vnd(3_000_000),
  ...extra,
});

/** For tests: a snapshot of nothing for the period, to fill with what a test reads. */
export const emptySnapshot = (period: { from: IsoDate; to: IsoDate; asOf: IsoDate }, change: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  ...period,
  properties: [],
  incomes: [],
  expenses: [],
  invoices: [],
  leases: [],
  leaseInvoices: [],
  schedule: [],
  units: [],
  tenancies: [],
  valuations: [],
  owners: [],
  tax: { leases: [], schedule: [], shares: [], rules: [] },
  ...change,
});
