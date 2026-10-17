'use server';

import { normalizeRing, ringToGeoJson, type GeoPoint } from '@esta/core/maps';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ringFromStored } from '@/server/properties/boundary';
import { createSessionClient } from '@/server/supabase/server';

export type LocationWrite<T> = { readonly ok: true; readonly previous: T | null } | { readonly ok: false; readonly reason: 'invalid' | 'self_crossing' | 'failed' };

const id = z.uuid();
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const ring = z.array(point).max(500);

const CHECK_VIOLATION = '23514';

/** Returns the point it replaced, so the toast's Hoàn tác writes exactly that back and a second tap changes nothing. */
export async function setPropertyLocation(propertyId: unknown, next: unknown): Promise<LocationWrite<GeoPoint>> {
  const parsedId = id.safeParse(propertyId);
  const parsedPoint = point.nullable().safeParse(next);
  if (!parsedId.success || !parsedPoint.success) return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('set_property_location', {
    p_property_id: parsedId.data,
    ...(parsedPoint.data === null ? {} : { p_lat: parsedPoint.data.lat, p_lng: parsedPoint.data.lng }),
  });
  if (error) return { ok: false, reason: 'failed' };
  revalidatePath('/properties');
  const previous = point.nullable().safeParse(data);
  return { ok: true, previous: previous.success ? previous.data : null };
}

/** `null` clears the boundary; the ring is normalized here as well as in the browser, and Postgres refuses a crossing ring. */
export async function setPropertyBoundary(propertyId: unknown, next: unknown): Promise<LocationWrite<GeoPoint[]>> {
  const parsedId = id.safeParse(propertyId);
  const parsedRing = ring.nullable().safeParse(next);
  if (!parsedId.success || !parsedRing.success) return { ok: false, reason: 'invalid' };
  const normalized = parsedRing.data === null ? null : normalizeRing(parsedRing.data);
  if (normalized !== null && !normalized.ok) return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('set_property_boundary', {
    p_property_id: parsedId.data,
    p_boundary: normalized === null ? null : ringToGeoJson(normalized.value),
  });
  if (error) return { ok: false, reason: error.code === CHECK_VIOLATION ? 'self_crossing' : 'failed' };
  revalidatePath('/properties');
  return { ok: true, previous: ringFromStored(data) };
}
