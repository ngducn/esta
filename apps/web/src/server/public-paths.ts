const PUBLIC_EXACT = ['/sign-in', '/sign-in/callback', '/dev'] as const;
const PUBLIC_PREFIXES = ['/api/cron/', '/api/test/', '/dev/'] as const;

/** Paths a signed-out request may reach. Everything else redirects to /sign-in. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.some((path) => pathname === path) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
