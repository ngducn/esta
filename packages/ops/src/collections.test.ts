import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { readCollectionRows } from './collections';
import { fakeDb, HOUSEHOLD } from './test/fake-db';

const candidate = (overrides: Record<string, unknown>) => ({
  invoice_id: '00000000-0000-4000-8000-0000000b0001',
  property_id: '00000000-0000-4000-8000-0000000c0001',
  property_nickname: 'Dãy trọ Demo',
  property_archived: false,
  unit_label: 'Phòng 1',
  unit_kind: 'room',
  lease_id: '00000000-0000-4000-8000-000000000005',
  tenant_name: 'Nguyễn Văn Demo',
  number: 'DIAN-202702-004',
  due_date: '2027-02-25',
  total_vnd: 2_500_000,
  allocated_vnd: 0,
  outstanding_vnd: 2_500_000,
  payment_status: 'unpaid',
  ...overrides,
});

describe('readCollectionRows', () => {
  it('asks collection_candidates for the month and keeps one household and one property', async () => {
    const { db, sent } = fakeDb(() => [candidate({})]);
    await readCollectionRows(db, HOUSEHOLD, isoDate('2026-10-01'), '00000000-0000-4000-8000-0000000c0001');
    expect(sent.map(({ table, query, body }) => ({ table, household: query.get('household_id'), property: query.get('property_id'), body }))).toEqual([
      { table: 'rpc/collection_candidates', household: `eq.${HOUSEHOLD}`, property: 'eq.00000000-0000-4000-8000-0000000c0001', body: { p_month: '2026-10-01' } },
    ]);
  });

  it('reads a bill whose meter credit outweighs its rent, so one such bill cannot take down Home and the board', async () => {
    const { db } = fakeDb(() => [candidate({ total_vnd: -91_650_000, allocated_vnd: 0, outstanding_vnd: 0, payment_status: 'overpaid' })]);
    const [row] = await readCollectionRows(db, HOUSEHOLD, isoDate('2027-02-01'));
    expect(row?.totalVnd).toBe(-91_650_000);
    expect(row?.outstandingVnd).toBe(0);
  });

  it('marks a bill whose property was archived while it was still owed', async () => {
    const { db } = fakeDb(() => [candidate({ property_nickname: 'Nhà Demo đã bán', property_archived: true, unit_label: 'Toàn bộ', unit_kind: 'whole', tenant_name: null, total_vnd: 9_000_000, outstanding_vnd: 9_000_000 })]);
    const [row] = await readCollectionRows(db, HOUSEHOLD, isoDate('2026-10-01'));
    expect(row).toMatchObject({ propertyArchived: true, wholeUnit: true, outstandingVnd: 9_000_000 });
  });
});
