import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leaseV1Schema } from '../../../packages/core/src/agent-schemas/lease_v1.ts';
import { LEASES, LEASES_DIR, leaseTruth, renderLease } from './leases.tsx';

const manifest = JSON.parse(readFileSync(join(LEASES_DIR, 'manifest.json'), 'utf8')) as Record<string, Record<string, string>>;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('lease fixtures', () => {
  it('renders the bytes the committed manifest recorded, so the replay recordings still match', async () => {
    for (const lease of LEASES) {
      const files = await renderLease(lease);
      expect(Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])), lease.id).toEqual(manifest[lease.id]);
    }
  }, 30_000);

  it('names only Demo people, prints invented 12-digit IDs, and holds a valid lease_v1 truth', () => {
    for (const lease of LEASES) {
      for (const party of [lease.landlord, lease.tenant]) {
        expect(party.name).toContain('Demo');
        expect(party.nationalId).toMatch(/^\d{12}$/);
      }
      expect(leaseV1Schema.safeParse(leaseTruth(lease)).success, lease.id).toBe(true);
    }
  });
});
