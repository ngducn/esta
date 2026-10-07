import { expect, test } from 'vitest';
import { vnd } from '../money/vnd';
import { parseVndInput } from '../parse/vnd-input';
import { formatVnd, formatVndCompact } from './index';

const BUDGET_MS = 0.005;

test('formatVnd, formatVndCompact and parseVndInput each stay under 5 µs per call', async ({ bench }) => {
  const results = await bench.compare(
    bench('formatVnd', () => {
      formatVnd(vnd(15_000_000), 'vi');
    }),
    bench('formatVndCompact', () => {
      formatVndCompact(vnd(3_200_000_000), 'vi');
    }),
    bench('parseVndInput 3tr5', () => {
      parseVndInput('3tr5');
    }),
    bench('parseVndInput 1.500.000.000 đồng', () => {
      parseVndInput('1.500.000.000 đồng');
    }),
  );
  for (const name of ['formatVnd', 'formatVndCompact', 'parseVndInput 3tr5', 'parseVndInput 1.500.000.000 đồng'] as const) {
    expect(results.get(name).latency.mean, name).toBeLessThan(BUDGET_MS);
  }
});
