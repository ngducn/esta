/** The manifest is fetched without cookies, so a home-screen install needs it signed out. */
const PUBLIC_EXACT = ['/sign-in', '/sign-in/callback', '/dev', '/manifest.webmanifest'] as const;
const PUBLIC_PREFIXES = ['/api/cron/', '/api/test/', '/dev/'] as const;

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.some((path) => pathname === path) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
