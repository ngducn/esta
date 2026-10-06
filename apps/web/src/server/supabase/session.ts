import type { CookieOptions } from '@supabase/ssr';

/** SPEC D8: a session lasts 30 days, matching `[auth.sessions] timebox` in supabase/config.toml. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** @supabase/ssr always writes a 400-day maxAge, so the session cookie is capped here. Removals keep maxAge 0. */
export function sessionCookie(options: CookieOptions): CookieOptions {
  return options.maxAge !== undefined && options.maxAge > 0 ? { ...options, maxAge: SESSION_MAX_AGE_SECONDS } : options;
}
