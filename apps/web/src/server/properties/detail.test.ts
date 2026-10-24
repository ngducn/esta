import { leaseRowSchema } from '@esta/core/schemas/lease';
import { afterEach, describe, expect, test, vi } from 'vitest';

const PROPERTY_ID = '5a7ba01a-8719-556b-a777-e918d5c2db9a';
const HOUSEHOLD_ID = '0943e55d-b0a6-5aef-839d-07c8693c520e';

type Result = { readonly data: unknown; readonly error: { message: string } | null };

const board = vi.hoisted(() => ({ result: { data: [], error: null } as Result }));

vi.mock('server-only', () => ({}));
vi.mock('@/server/clock', () => ({ getClock: async () => ({ today: () => '2026-10-07' }) }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: HOUSEHOLD_ID } }) }));
vi.mock('@/server/leases/load', () => ({ loadHoldingLeases: async () => ({ leases: sixLetRooms, schedule: [] }) }));
vi.mock('@/server/supabase/server', () => ({
  createSessionClient: async () => ({
    from: (table: string) => query(table === 'properties' ? { data: { kind_details: { room_count: 8 } }, error: null } : { data: propertyRow, error: null }),
    rpc: () => query(board.result),
  }),
}));

/** A PostgREST builder: every filter returns itself, and awaiting it or `maybeSingle()` yields `result`. */
function query(result: Result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const propertyRow = {
  id: PROPERTY_ID,
  nickname: 'Dãy trọ Dĩ An',
  code: 'DIAN',
  kind: 'rooming_house',
  use_mode: 'rental',
  legal_status: 'certified',
  cover_photo_path: null,
  address_line: null,
  commune_name: null,
  province_code: null,
  province_name: null,
  certificate_address_text: null,
  legacy_province_names: null,
  search_text: null,
  lat: null,
  lng: null,
  has_boundary: false,
  owner_party_ids: null,
  vacant_since: null,
  unit_count: 8,
};

/** Six of the eight rooms under a running lease. */
const sixLetRooms = Array.from({ length: 6 }, (_, room) =>
  leaseRowSchema.parse({
    id: `00000000-0000-4000-8000-0000000e00${room}1`,
    property_id: PROPERTY_ID,
    unit_id: `00000000-0000-4000-8000-0000000a00${room}1`,
    tenant_party_id: null,
    start_date: '2026-02-25',
    end_date: '2027-06-24',
    rent_vnd: 2_800_000,
    billing_cycle_months: 1,
    period_anchor: 'lease_start',
    first_period_proration: 'by_days',
    due_offset_days: 0,
    deposit_vnd: null,
    escalation: { kind: 'none' },
    utilities_mode: 'metered_by_owner',
    tax_payer: 'owner',
    notice_days: null,
    paid_through_date: null,
    status: 'active',
    terminated_on: null,
    termination_reason: null,
    renewal_of_lease_id: null,
  }),
);

const overdueRoom = {
  invoice_id: 'a3b0c6a4-0f43-5d55-9d55-3a0b1b8f7c11',
  property_id: PROPERTY_ID,
  property_nickname: 'Dãy trọ Dĩ An',
  property_archived: false,
  unit_label: 'Phòng 5',
  unit_kind: 'room',
  lease_id: '04826c70-a540-56b8-9de6-1a44987c371f',
  tenant_name: 'Hoàng Văn Em Demo',
  number: 'DIAN-202609-005',
  due_date: '2026-09-25',
  total_vnd: 2_800_000,
  allocated_vnd: 0,
  outstanding_vnd: 2_800_000,
  payment_status: 'unpaid',
};

const { loadPropertyDetail } = await import('./detail');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadPropertyDetail, which every property tab renders from', () => {
  test('shows the worst payment state of the month as the pill', async () => {
    board.result = { data: [overdueRoom], error: null };
    const property = await loadPropertyDetail(PROPERTY_ID);
    expect(property?.statuses).toEqual([
      { kind: 'overdue', days: 12 },
      { kind: 'leased', leased: 6, total: 8 },
    ]);
  });

  test('still loads the property, without a payment pill, when the board query fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    board.result = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    const property = await loadPropertyDetail(PROPERTY_ID);
    expect(property?.nickname).toBe('Dãy trọ Dĩ An');
    expect(property?.statuses).toEqual([{ kind: 'leased', leased: 6, total: 8 }]);
    expect(logged).toHaveBeenCalledOnce();
  });
});
