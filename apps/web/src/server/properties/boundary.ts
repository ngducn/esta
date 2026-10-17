import 'server-only';
import { ringFromGeoJson, type GeoPoint } from '@esta/core/maps';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

const storedPolygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

/** The outer ring of a stored boundary as open-ring vertices, the shape the editor draws and the writer takes. */
export function ringFromStored(data: unknown): GeoPoint[] | null {
  const parsed = storedPolygon.safeParse(data);
  if (!parsed.success) return null;
  const ring = ringFromGeoJson(parsed.data);
  return ring.ok ? ring.value.slice(0, -1).map(({ lat, lng }) => ({ lat, lng })) : null;
}

export async function readBoundary(propertyId: string): Promise<GeoPoint[] | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('property_boundary', { p_property_id: propertyId });
  if (error) throw new Error(`Reading the boundary failed: ${error.message}`);
  return ringFromStored(data);
}
