import 'server-only';
import { sameOrigin } from '@/server/supabase/same-origin';
import { createSessionClient } from '@/server/supabase/server';
import { coverUrlCache } from './cover-url-cache';

export const PROPERTY_PHOTOS_BUCKET = 'property-photos';

/**
 * Covers sign for a day rather than `ESTA_SIGNED_URL_TTL_SECONDS`, which DOC-4 sets for documents: a cover is a
 * card-size house photo, and a URL that stays the same for half a day is what lets a phone keep it in its cache.
 */
const COVER_URL_TTL_SECONDS = 24 * 60 * 60;

const signCached = coverUrlCache(COVER_URL_TTL_SECONDS);

/**
 * Signing runs on the member's own session, so the storage select policy decides every URL and the service role never
 * signs one. A path the member may not read, or whose object is gone, gets no URL.
 */
export async function signCoverPhotos(memberId: string, paths: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (paths.length === 0) return new Map();
  return signCached(memberId, paths, Date.now(), async (missing) => {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.storage.from(PROPERTY_PHOTOS_BUCKET).createSignedUrls(missing, COVER_URL_TTL_SECONDS);
    if (error) throw new Error(`Signing cover photos failed: ${error.message}`);
    return data.map(({ path, signedUrl }) => ({ path, signedUrl: signedUrl === null ? null : sameOrigin(signedUrl) }));
  });
}
