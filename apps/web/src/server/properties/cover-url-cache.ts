export type SignedPath = { path: string | null; signedUrl: string | null };

type Entry = { url: string; reuseUntilMs: number };

/**
 * Storage gives every signing call a new token, and the browser caches a photo by its full URL. Reusing one member's
 * URL for a path while more than half its life remains lets a return visit load the cover from the browser cache, and
 * the half left over covers a page that stays open.
 */
export function coverUrlCache(ttlSeconds: number) {
  const entries = new Map<string, Entry>();
  const keyOf = (memberId: string, path: string) => `${memberId}/${path}`;

  return async function sign(
    memberId: string,
    paths: readonly string[],
    nowMs: number,
    signMissing: (paths: string[]) => Promise<readonly SignedPath[]>,
  ): Promise<ReadonlyMap<string, string>> {
    for (const [key, entry] of entries) if (entry.reuseUntilMs <= nowMs) entries.delete(key);
    const unique = [...new Set(paths)];
    const missing = unique.filter((path) => !entries.has(keyOf(memberId, path)));
    if (missing.length > 0) {
      const reuseUntilMs = nowMs + (ttlSeconds * 1000) / 2;
      for (const { path, signedUrl } of await signMissing(missing)) {
        if (path !== null && signedUrl !== null) entries.set(keyOf(memberId, path), { url: signedUrl, reuseUntilMs });
      }
    }
    return new Map(
      unique.flatMap((path) => {
        const entry = entries.get(keyOf(memberId, path));
        return entry === undefined ? [] : [[path, entry.url] as const];
      }),
    );
  };
}
