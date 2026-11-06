import { memoryDb } from '@esta/ops/test/memory-db';
import { describe, expect, it } from 'vitest';
import { openLinkTarget } from './open-link';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT = uuid(1);
const lease = (n: number, property: number, status: string, start: string) => ({ id: uuid(100 + n), property_id: uuid(property), tenant_party_id: TENANT, status, start_date: start });
const open = (tables: Parameters<typeof memoryDb>[0]) => openLinkTarget(memoryDb({ ownership_shares: [], ...tables }), `party/${TENANT}`);

describe('openLinkTarget on a person (#366)', () => {
  it('opens the active lease that started first when she has two at two properties', async () => {
    const later = lease(2, 20, 'active', '2026-06-01');
    const earlier = lease(1, 10, 'active', '2026-01-01');
    for (const leases of [[later, earlier], [earlier, later]]) expect(await open({ leases })).toBe(`/properties/${uuid(10)}/rental/leases/${uuid(101)}`);
  });

  it('opens the newest lease when all of hers have ended', async () => {
    const leases = [lease(1, 10, 'ended', '2024-01-01'), lease(3, 30, 'ended', '2026-03-01'), lease(2, 20, 'ended', '2025-01-01')];
    expect(await open({ leases })).toBe(`/properties/${uuid(30)}/rental/leases/${uuid(103)}`);
  });

  it('prefers an active lease over a newer draft or ended one', async () => {
    const leases = [lease(1, 10, 'draft', '2026-09-01'), lease(2, 20, 'active', '2026-01-01'), lease(3, 30, 'ended', '2026-08-01')];
    expect(await open({ leases })).toBe(`/properties/${uuid(20)}/rental/leases/${uuid(102)}`);
  });

  it('opens the tax card for an owner with no lease, and nothing for anyone else', async () => {
    expect(await open({ leases: [], ownership_shares: [{ id: uuid(9), party_id: TENANT }] })).toBe('/reports/tax');
    expect(await open({ leases: [lease(1, 10, 'active', '2026-01-01')].map((row) => ({ ...row, tenant_party_id: uuid(2) })) })).toBeNull();
  });
});
