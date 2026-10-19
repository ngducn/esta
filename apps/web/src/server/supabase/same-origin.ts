/**
 * A signed Storage URL as a path on the app's own origin, which `proxy.ts` rewrites to Storage without the session
 * cookie. A phone then fetches the image over the page's open connection instead of opening one to Storage.
 */
export function sameOrigin(signedUrl: string): string {
  const url = new URL(signedUrl);
  return `${url.pathname}${url.search}`;
}
