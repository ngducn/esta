import 'server-only';
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
