import type { CookieOptions } from '@supabase/ssr';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** @supabase/ssr always writes a 400-day maxAge. */
export function sessionCookie(options: CookieOptions): CookieOptions {
  return options.maxAge !== undefined && options.maxAge > 0 ? { ...options, maxAge: SESSION_MAX_AGE_SECONDS } : options;
}
