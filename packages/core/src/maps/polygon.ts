import type { Result } from '../result';
import { toLatLng, type LatLng } from './parse-maps-url';

declare const ringBrand: unique symbol;

/** A closed ring: the first vertex repeats as the last, with at least 3 distinct vertices before it, every one in range. */
export type BoundaryRing = readonly LatLng[] & { readonly [ringBrand]: true };

/** An unchecked point as forms, the map and the database hand it over; `toLatLng` turns one into a checked `LatLng`. */
export type GeoPoint = { readonly lat: number; readonly lng: number };

export type RingInvalidReason = 'too_few_vertices' | 'out_of_range';

export type GeoJsonPolygon = { type: 'Polygon'; coordinates: [lng: number, lat: number][][] };

const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

/** Drops consecutive repeats, closes an open ring and refuses fewer than 3 distinct vertices or a vertex out of range. */
export function normalizeRing(points: readonly GeoPoint[]): Result<BoundaryRing, RingInvalidReason> {
  const ring: LatLng[] = [];
  for (const { lat, lng } of points) {
    const point = toLatLng(lat, lng);
    if (!point.ok) return { ok: false, reason: 'out_of_range' };
    const last = ring.at(-1);
    if (last === undefined || !same(last, point.value)) ring.push(point.value);
  }
  const [first] = ring;
  const last = ring.at(-1);
  if (first !== undefined && last !== undefined && ring.length > 1 && same(first, last)) ring.pop();
  if (new Set(ring.map(({ lat, lng }) => `${lat},${lng}`)).size < 3) return { ok: false, reason: 'too_few_vertices' };
  return { ok: true, value: [...ring, ring[0]] as unknown as BoundaryRing };
}

export function isValidBoundary(ring: readonly GeoPoint[]): ring is BoundaryRing {
  const [first] = ring;
  const last = ring.at(-1);
  if (first === undefined || last === undefined || first.lat !== last.lat || first.lng !== last.lng) return false;
  const normalized = normalizeRing(ring);
  return normalized.ok && normalized.value.length === ring.length;
}

export function ringToGeoJson(ring: BoundaryRing): GeoJsonPolygon {
  return { type: 'Polygon', coordinates: [ring.map(({ lat, lng }) => [lng, lat])] };
}

/** Reads the outer ring of a stored polygon; holes are not drawn or edited in v1. */
export function ringFromGeoJson(polygon: GeoJsonPolygon): Result<BoundaryRing, RingInvalidReason> {
  return normalizeRing((polygon.coordinates[0] ?? []).map(([lng, lat]) => ({ lat, lng })));
}
