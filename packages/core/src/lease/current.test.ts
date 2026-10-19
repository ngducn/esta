import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { leaseRowSchema } from '../schemas/lease';
import { currentLease, rentInEffect } from './current';

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
const unit = uuid();

/** A `leases` row as the session client reads it: Thủ Đức's monthly lease unless the test says otherwise. */
const row = (values: Record<string, unknown>) =>
  leaseRowSchema.parse({
    id: uuid(),
    property_id: uuid(),
    unit_id: unit,
    tenant_party_id: null,
    start_date: '2025-11-01',
    end_date: '2026-11-01',
    rent_vnd: 9_000_000,
    billing_cycle_months: 1,
    period_anchor: 'calendar_month',
    first_period_proration: 'by_days',
    due_offset_days: 0,
    deposit_vnd: 18_000_000,
    escalation: { kind: 'none' },
    utilities_mode: 'tenant_direct',
    tax_payer: 'owner',
    notice_days: 30,
    paid_through_date: null,
    status: 'active',
    terminated_on: null,
    termination_reason: null,
    renewal_of_lease_id: null,
    ...values,
  });

const old = row({});
const renewal = row({ start_date: '2026-11-02', end_date: '2027-11-01', rent_vnd: 9_500_000, renewal_of_lease_id: old.id });
/** `lease_schedule` for both leases: Thủ Đức amended to 9.200.000 ₫ from 01/10, the renewal from 02/11. */
const schedule = [
  ...schedulePeriods(old.id, '2025-11-01', 9_000_000, 12).map((period) => (period.start >= '2026-10-01' ? { ...period, monthlyRentVnd: vnd(9_200_000) } : period)),
  ...schedulePeriods(renewal.id, '2026-11-02', 9_500_000, 12),
];

describe('currentLease (the lease a unit shows)', () => {
  it('keeps a lease terminated from 31/10 as the unit lease through that day, then shows the unit vacant', () => {
    const terminated = row({ status: 'terminated', end_date: '2026-10-31', terminated_on: '2026-10-31' });
    expect(currentLease([terminated], d('2026-10-07'))).toBe(terminated);
    expect(currentLease([terminated], d('2026-10-31'))).toBe(terminated);
    expect(currentLease([terminated], d('2026-11-01'))).toBeUndefined();
  });

  it('shows the running lease, not an early renewal, until the renewal starts', () => {
    expect(currentLease([renewal, old], d('2026-10-07'))).toBe(old);
    expect(currentLease([renewal, old], d('2026-11-01'))).toBe(old);
    expect(currentLease([renewal, old], d('2026-11-02'))).toBe(renewal);
  });

  it('falls back to a draft, and shows nothing for an ended lease', () => {
    const draft = row({ status: 'draft', start_date: null });
    const ended = row({ status: 'ended', end_date: '2026-09-15' });
    expect(currentLease([ended, draft], d('2026-10-07'))).toBe(draft);
    expect(currentLease([ended], d('2026-10-07'))).toBeUndefined();
  });
});

describe('rentInEffect (the contracted rent a property list shows)', () => {
  it('counts an early renewal only from its start and an amendment from its period', () => {
    expect(rentInEffect([old, renewal], schedule, d('2026-09-15'))).toBe(9_000_000);
    expect(rentInEffect([old, renewal], schedule, d('2026-10-07'))).toBe(9_200_000);
    expect(rentInEffect([old, renewal], schedule, d('2026-11-02'))).toBe(9_500_000);
  });

  it('sums the leases in effect across units, keeps a terminated one until its date, and reads the agreed rent without a schedule', () => {
    const room = row({ unit_id: uuid(), start_date: '2026-08-01', end_date: '2026-10-31', rent_vnd: 2_500_000, status: 'terminated', terminated_on: '2026-10-31' });
    expect(rentInEffect([old, renewal, room], [], d('2026-10-31'))).toBe(11_500_000);
    expect(rentInEffect([old, renewal, room], [], d('2026-11-01'))).toBe(9_000_000);
  });

  it('is null when no lease is in effect', () => {
    expect(rentInEffect([renewal], [], d('2026-10-07'))).toBeNull();
    expect(rentInEffect([], [], d('2026-10-07'))).toBeNull();
  });
});
