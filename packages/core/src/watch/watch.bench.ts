import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { evaluateWatch } from './registry';
import { watchSnapshotSchema } from './types';

const fullSeed = watchSnapshotSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/full-2026-10-07.snapshot.json'), 'utf8')));

test('the full-seed household evaluates in under 5 ms', async ({ bench }) => {
  expect(evaluateWatch(fullSeed)).toHaveLength(8);
  const result = await bench('evaluateWatch, full seed', () => {
    evaluateWatch(fullSeed);
  }).run();
  console.info(`evaluateWatch, full seed: mean ${result.latency.mean.toFixed(3)} ms, p99 ${result.latency.p99.toFixed(3)} ms`);
  expect(result.latency.mean).toBeLessThan(5);
});
