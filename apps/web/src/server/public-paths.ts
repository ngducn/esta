/** The ways in. A signed-in visitor is sent on to `/` from each of them. */
const AUTH_PAGES = ['/sign-in', '/sign-in/code', '/sign-up', '/forgot-password'] as const;
/** The manifest is fetched without cookies, so a home-screen install needs it signed out. */
const PUBLIC_EXACT = [...AUTH_PAGES, '/sign-in/callback', '/dev', '/manifest.webmanifest'] as const;
const PUBLIC_PREFIXES = ['/api/cron/', '/api/test/', '/dev/'] as const;

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((path) => pathname === path);
}

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.some((path) => pathname === path) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
