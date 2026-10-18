import { expect, test } from 'vitest';
import { PROPERTY_KINDS } from '../properties/kinds';
import { COMPLETENESS_CHECKS } from './registry';
import { scoreProperty } from './score';
import type { CompletenessFacts } from './types';

const BUDGET_MS = 10;

const thousand: CompletenessFacts[] = Array.from({ length: 1000 }, (_, i) => ({
  propertyId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  kind: PROPERTY_KINDS[i % PROPERTY_KINDS.length] ?? 'other',
  hasCurrentAddress: i % 2 === 0,
  hasLocation: i % 3 === 0,
  hasAcquisition: i % 5 === 0,
  parcelCount: i % 4,
  parcelWithoutNumberId: i % 7 === 0 ? `p-${i}` : null,
  parcelWithoutAreaId: i % 11 === 0 ? `p-${i}` : null,
  structureCount: i % 2,
  structureWithoutFloorAreaId: null,
  shareTotalBp: i % 6 === 0 ? 9000 : 10_000,
  utilityAccountCount: i % 3,
  certificateDocumentCount: i % 2,
  photoCount: i % 4,
}));

test('scoring 1,000 properties stays under 10 ms', async ({ bench }) => {
  const result = await bench('scoreProperty × 1000', () => {
    for (const facts of thousand) scoreProperty(facts, COMPLETENESS_CHECKS);
  }).run();
  expect(result.latency.p50).toBeLessThan(BUDGET_MS);
});
