import { expect, test } from 'vitest';
import fixture from '../../../../fixtures/maps/links.json';
import { parseMapsUrl } from './parse-maps-url';

const BUDGET_MS_PER_CALL = 0.02;
const inputs = fixture.cases.map((row) => row.input);

test('parseMapsUrl stays under 20 µs per call over fixtures/maps/links.json', async ({ bench }) => {
  const result = await bench('parseMapsUrl, every fixture link', () => {
    for (const input of inputs) parseMapsUrl(input);
  }).run();
  const perCall = result.latency.mean / inputs.length;
  expect(perCall, `${(perCall * 1000).toFixed(2)} µs per call`).toBeLessThan(BUDGET_MS_PER_CALL);
});
