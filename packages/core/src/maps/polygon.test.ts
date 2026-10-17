import { describe, expect, test } from 'vitest';
import { isValidBoundary, normalizeRing, ringFromGeoJson, ringToGeoJson } from './polygon';

const a = { lat: 11.5, lng: 107.8 };
const b = { lat: 11.5, lng: 107.81 };
const c = { lat: 11.51, lng: 107.81 };
const d = { lat: 11.51, lng: 107.8 };
const square = [a, b, c, d];

describe('normalizeRing', () => {
  test('closes an open ring by repeating the first vertex', () => {
    const ring = normalizeRing(square);
    expect(ring).toEqual({ ok: true, value: [...square, a] });
  });

  test('keeps an already closed ring as it is', () => {
    expect(normalizeRing([...square, a])).toEqual({ ok: true, value: [...square, a] });
  });

  test('refuses two distinct vertices, even repeated', () => {
    expect(normalizeRing([a, b, a, b])).toEqual({ ok: false, reason: 'too_few_vertices' });
    expect(normalizeRing([a, b])).toEqual({ ok: false, reason: 'too_few_vertices' });
    expect(normalizeRing([])).toEqual({ ok: false, reason: 'too_few_vertices' });
  });

  test('removes consecutive duplicates', () => {
    expect(normalizeRing([a, a, b, b, b, c, a])).toEqual({ ok: true, value: [a, b, c, a] });
  });

  test('refuses a vertex out of range', () => {
    expect(normalizeRing([...square, { lat: 91, lng: 107 }])).toEqual({ ok: false, reason: 'out_of_range' });
    expect(normalizeRing([...square, { lat: 10, lng: -180.5 }])).toEqual({ ok: false, reason: 'out_of_range' });
    expect(normalizeRing([...square, { lat: Number.NaN, lng: 107 }])).toEqual({ ok: false, reason: 'out_of_range' });
  });
});

describe('isValidBoundary', () => {
  test('accepts a closed ring of three distinct vertices', () => {
    expect(isValidBoundary([a, b, c, a])).toBe(true);
  });

  test('refuses an open ring, a ring with a repeat and a degenerate ring', () => {
    expect(isValidBoundary(square)).toBe(false);
    expect(isValidBoundary([a, a, b, c, a])).toBe(false);
    expect(isValidBoundary([a, b, a])).toBe(false);
  });
});

test('GeoJSON round trip writes lng before lat and reads the outer ring back', () => {
  const ring = normalizeRing(square);
  if (!ring.ok) throw new Error('square is a valid ring');
  const polygon = ringToGeoJson(ring.value);
  expect(polygon.coordinates[0]?.[1]).toEqual([107.81, 11.5]);
  expect(ringFromGeoJson(polygon)).toEqual(ring);
});
