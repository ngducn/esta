import type { CookieOptions } from '@supabase/ssr';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function isHttps(requestHeaders: Headers): boolean {
  return requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}

/** @supabase/ssr always writes a 400-day maxAge, and leaves the cookie readable by scripts for its browser client, which this app never runs. */
export function sessionCookie(options: CookieOptions, requestHeaders: Headers): CookieOptions {
  const flags = { httpOnly: true, secure: isHttps(requestHeaders) };
  return options.maxAge !== undefined && options.maxAge > 0
    ? { ...options, ...flags, maxAge: SESSION_MAX_AGE_SECONDS }
    : { ...options, ...flags };
}
