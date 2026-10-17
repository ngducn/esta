import { describe, expect, it } from 'vitest';
import { groupPins, worldPixels } from './pin-groups';

const pin = (id: string, x: number, y: number) => ({ id, lat: y, lng: x });
const flat = (p: { lat: number; lng: number }) => ({ x: p.lng, y: p.lat });

describe('groupPins', () => {
  it('keeps pins a touch target apart as single pins keyed by id', () => {
    const groups = groupPins([pin('a', 0, 0), pin('b', 44, 0)], flat, 44);
    expect(groups.map(({ key, pins }) => [key, pins.length])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('merges pins closer than the radius into one group at their mean point', () => {
    const groups = groupPins([pin('a', 0, 0), pin('b', 10, 20), pin('c', 200, 0)], flat, 44);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: 'group:a,b', lat: 10, lng: 5 });
    expect(groups[0]?.pins.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(groups[1]?.key).toBe('c');
  });

  it('puts every pin in exactly one group', () => {
    const pins = Array.from({ length: 30 }, (_, i) => pin(`p${i}`, (i * 37) % 120, (i * 53) % 90));
    const ids = groupPins(pins, flat, 44).flatMap(({ pins: members }) => members.map(({ id }) => id));
    expect(ids.toSorted()).toEqual(pins.map(({ id }) => id).toSorted());
  });
});

describe('worldPixels', () => {
  it('doubles distances with each zoom level', () => {
    const a = { lat: 10.9068, lng: 106.769 };
    const b = { lat: 10.97, lng: 106.846 };
    const gap = (zoom: number) => Math.hypot(worldPixels(a, zoom).x - worldPixels(b, zoom).x, worldPixels(a, zoom).y - worldPixels(b, zoom).y);
    expect(gap(9) / gap(8)).toBeCloseTo(2, 6);
    expect(gap(8)).toBeLessThan(44);
  });
});
