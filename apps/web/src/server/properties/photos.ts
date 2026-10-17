import 'server-only';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';

export const PROPERTY_PHOTOS_BUCKET = 'property-photos';

/**
 * One signing call per render on the member's own session, so the storage select policy decides every URL and the
 * service role never signs one. A path the member may not read, or whose object is gone, gets no URL.
 */
export async function signCoverPhotos(paths: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(PROPERTY_PHOTOS_BUCKET).createSignedUrls(unique, env.ESTA_SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`Signing cover photos failed: ${error.message}`);
  return new Map(data.flatMap((item) => (item.path !== null && item.signedUrl !== null ? [[item.path, item.signedUrl] as const] : [])));
}
