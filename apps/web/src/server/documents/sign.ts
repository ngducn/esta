import 'server-only';
import { reviewPath, thumbPath } from '@esta/core/documents';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';

export const DOCUMENTS_BUCKET = 'documents';

/**
 * Signs on the member's own session, so the storage select policy decides every URL and the service role never
 * signs one. A path the member may not read, or whose object is gone, gets null.
 */
export async function signDocumentUrls(paths: readonly string[], ttl: number, { download = false }: { download?: boolean } = {}): Promise<ReadonlyMap<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls([...paths], ttl, download ? { download: true } : undefined);
  if (error) throw new Error(`Signing documents failed: ${error.message}`);
  return new Map(data.flatMap(({ path, signedUrl }) => (path === null || signedUrl === null ? [] : [[path, signedUrl]])));
}

/** `download` makes Storage answer with an attachment, so the browser saves the file instead of showing it. */
export async function signDocumentUrl(path: string, ttl: number, options: { download?: boolean } = {}): Promise<string | null> {
  return (await signDocumentUrls([path], ttl, options)).get(path) ?? null;
}

export type PagePreviews = {
  /** Page 1 at review size; null for a document uploaded before review copies existed. */
  readonly reviewUrl: string | null;
  readonly thumbUrl: string | null;
};

/** The two previews a document's pager shows before or instead of the file, signed in one request. */
export async function signPagePreviews(householdId: string, documentId: string): Promise<PagePreviews> {
  const review = reviewPath(householdId, documentId);
  const thumb = thumbPath(householdId, documentId);
  const urls = await signDocumentUrls([review, thumb], env.ESTA_SIGNED_URL_TTL_SECONDS);
  return { reviewUrl: urls.get(review) ?? null, thumbUrl: urls.get(thumb) ?? null };
}
