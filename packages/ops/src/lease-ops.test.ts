import { describe, expect, it } from 'vitest';
import { leaseCreate, leaseEdit } from './lease-ops';
import { demoDraft, fakeDb, LEASE, opContext as context, PROPERTY, ROOM, storedLease, TENANT } from './test/fake-db';
import { NO_PENDING, withWrites } from './view';

const OTHER_PROPERTY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0006';
const OTHER_ROOM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0007';

const roomAndTenant = withWrites(NO_PENDING, [
  { kind: 'create', table: 'units', row: { id: ROOM, property_id: PROPERTY, label: 'Phòng 2' } },
  { kind: 'create', table: 'parties', row: { id: TENANT, full_name: 'Lan Demo', phone: null, id_last4: '4567' } },
]);

function parsed<T>(schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false } }, raw: unknown): T {
  const input = schema.safeParse(raw);
  if (!input.success) throw new Error(`expected ${JSON.stringify(raw)} to parse`);
  return input.data;
}

describe('leaseCreate', () => {
  it('takes the lease form as the screen sends it, with or without the property, and nothing else', () => {
    expect(leaseCreate.input.safeParse({ id: LEASE, property_id: PROPERTY, lease: demoDraft }).success).toBe(true);
    expect(leaseCreate.input.safeParse({ id: LEASE, lease: demoDraft }).success).toBe(true);
    expect(leaseCreate.input.safeParse({ id: LEASE, lease: { ...demoDraft, status: 'active' } }).success).toBe(false);
  });

  it('plans a draft on a room and tenant planned earlier in the batch, spelling out what the database defaults', async () => {
    const input = parsed(leaseCreate.input, { id: LEASE, lease: demoDraft });
    const planned = await leaseCreate.plan(context(fakeDb().db, roomAndTenant), input);
    const row = { ...demoDraft, property_id: PROPERTY, status: 'draft', paid_through_date: null, due_offset_days: 0 };
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { id: LEASE, row } } });
    if (!planned.ok || planned.value.kind !== 'change') throw new Error('expected a change');
    expect(leaseCreate.writes?.(planned.value.change)).toEqual([{ kind: 'create', table: 'leases', row: { id: LEASE, ...row } }]);
  });

  it("refuses a unit on another property than the screen's, and a unit or tenant it cannot find", async () => {
    const { db } = fakeDb();
    const onOther = await leaseCreate.plan(context(db, roomAndTenant), parsed(leaseCreate.input, { id: LEASE, property_id: OTHER_PROPERTY, lease: demoDraft }));
    expect(onOther).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'lease.unit_id', code: 'other_property' }] } });
    const missingUnit = await leaseCreate.plan(context(db), parsed(leaseCreate.input, { id: LEASE, lease: demoDraft }));
    expect(missingUnit).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'lease.unit_id', code: 'not_found' }] } });
    const roomOnly = withWrites(NO_PENDING, [{ kind: 'create', table: 'units', row: { id: ROOM, property_id: PROPERTY, label: 'Phòng 2' } }]);
    const missingTenant = await leaseCreate.plan(context(db, roomOnly), parsed(leaseCreate.input, { id: LEASE, lease: demoDraft }));
    expect(missingTenant).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'lease.tenant_party_id', code: 'not_found' }] } });
  });

  it('plans unchanged once its minted id is stored', async () => {
    const { db } = fakeDb((request) => (request.table === 'leases' ? [storedLease()] : []));
    expect(await leaseCreate.plan(context(db), parsed(leaseCreate.input, { id: LEASE, lease: demoDraft }))).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: LEASE } } });
  });
});

describe('leaseEdit', () => {
  const stored = (lease: Record<string, unknown>, units: unknown[] = []) => fakeDb((request) => (request.table === 'leases' ? [lease] : request.table === 'units' ? units : []));

  it('lists only the terms that change, with their values before', async () => {
    const { db } = stored(storedLease());
    const planned = await leaseEdit.plan(context(db), parsed(leaseEdit.input, { id: LEASE, property_id: PROPERTY, set: { ...demoDraft, rent_vnd: 9_500_000, notice_days: 60 } }));
    expect(planned).toEqual({ ok: true, value: { kind: 'change', change: { id: LEASE, before: { rent_vnd: 9_000_000, notice_days: 30 }, set: { rent_vnd: 9_500_000, notice_days: 60 } } } });
    if (!planned.ok || planned.value.kind !== 'change') throw new Error('expected a change');
    expect(leaseEdit.writes?.(planned.value.change)).toEqual([{ kind: 'set', table: 'leases', id: LEASE, set: { rent_vnd: 9_500_000, notice_days: 60 } }]);
  });

  it('plans unchanged when the form sends the stored terms back', async () => {
    const { db } = stored(storedLease());
    expect(await leaseEdit.plan(context(db), parsed(leaseEdit.input, { id: LEASE, set: demoDraft }))).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: LEASE } } });
  });

  it('refuses a lease that left draft with its status, and one on another property as not found', async () => {
    const active = stored(storedLease({ status: 'active', paid_through_date: '2026-09-30' }));
    expect(await leaseEdit.plan(context(active.db), parsed(leaseEdit.input, { id: LEASE, set: { rent_vnd: 9_500_000 } }))).toEqual({ ok: false, reason: { kind: 'not_draft', status: 'active' } });
    const draft = stored(storedLease());
    expect(await leaseEdit.plan(context(draft.db), parsed(leaseEdit.input, { id: LEASE, property_id: OTHER_PROPERTY, set: { rent_vnd: 9_500_000 } }))).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('checks the merged terms as the form does, and refuses a room on another property', async () => {
    const { db } = stored(storedLease(), [{ id: OTHER_ROOM, property_id: OTHER_PROPERTY, label: 'Phòng 9' }]);
    expect(await leaseEdit.plan(context(db), parsed(leaseEdit.input, { id: LEASE, set: { end_date: '2026-01-31' } }))).toEqual({
      ok: false,
      reason: { kind: 'invalid', issues: [{ path: 'end_date', code: 'custom' }] },
    });
    expect(await leaseEdit.plan(context(db), parsed(leaseEdit.input, { id: LEASE, set: { unit_id: OTHER_ROOM } }))).toEqual({
      ok: false,
      reason: { kind: 'invalid', issues: [{ path: 'set.unit_id', code: 'other_property' }] },
    });
  });

  it('takes only draft terms', () => {
    expect(leaseEdit.input.safeParse({ id: LEASE, set: { status: 'active' } }).success).toBe(false);
    expect(leaseEdit.input.safeParse({ id: LEASE, set: { paid_through_date: '2026-09-30' } }).success).toBe(false);
  });
});
