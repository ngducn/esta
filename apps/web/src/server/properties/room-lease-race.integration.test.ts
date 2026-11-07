import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';
import { seedId } from '../../../../../supabase/seed/generator/ids';
import { integrationLane } from '@/test/lanes';
import { service, stackName, stackUp } from '@/test/stack';

// `pnpm test:integration`: two real sessions on the slot's stack, so the unit row's lock decides who wins.
const { lane, household } = integrationLane(import.meta.url);
const propertyId = seedId(`seed:property:lane-${lane}:bao-loc`);
const rest = <T>(path: string, init?: RequestInit) => service<T>(`/rest/v1/${path}`, init);

describe.skipIf(!stackUp)(`trashing a room while a lease is made on it against ${stackName}`, () => {
  const units: string[] = [];
  const tenant = randomUUID();

  afterAll(async () => {
    if (units.length > 0) {
      await rest(`leases?unit_id=in.(${units.join(',')})`, { method: 'DELETE' });
      await rest(`units?id=in.(${units.join(',')})`, { method: 'DELETE' });
    }
    await rest(`parties?id=eq.${tenant}`, { method: 'DELETE' });
  });

  test('never leaves a lease on a room in the trash (Q-03)', async () => {
    await rest('parties', { method: 'POST', body: JSON.stringify({ id: tenant, household_id: household, kind: 'individual', full_name: 'Lê Văn Demo', tags: ['tenant'] }) });
    for (let round = 0; round < 8; round += 1) {
      const unitId = randomUUID();
      units.push(unitId);
      await rest('units', { method: 'POST', body: JSON.stringify({ id: unitId, household_id: household, property_id: propertyId, label: `Phòng race ${round}`, kind: 'room', list_rent_vnd: 3_000_000, sort_order: 900 + round }) });
      const lease = { id: randomUUID(), household_id: household, property_id: propertyId, unit_id: unitId, tenant_party_id: tenant, start_date: '2030-01-01', end_date: '2030-12-31', rent_vnd: 3_000_000, status: 'draft' };
      const [trash, make] = await Promise.allSettled([
        rest(`units?id=eq.${unitId}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString() }) }),
        rest('leases', { method: 'POST', body: JSON.stringify(lease) }),
      ]);
      expect([trash?.status, make?.status].filter((status) => status === 'fulfilled'), `round ${round}: exactly one of the two wins`).toHaveLength(1);
      const [row] = await rest<{ deleted_at: string | null }[]>(`units?id=eq.${unitId}&select=deleted_at`);
      const leases = await rest<{ id: string }[]>(`leases?unit_id=eq.${unitId}&select=id`);
      expect(row?.deleted_at !== null && leases.length > 0, `round ${round}: a lease on a trashed room`).toBe(false);
    }
  }, 60_000); // -- eight rounds of three database round trips each against the local stack (no stack here to time it)
});
