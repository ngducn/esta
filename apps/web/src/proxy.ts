import type { Database } from '@esta/db';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseEnv } from '@/server/env-schema';
import { isPublicPath } from '@/server/public-paths';
import { sessionCookie } from '@/server/supabase/session';

const env = parseEnv(process.env);

/** Covers load from the app's own origin, so a phone reuses the page's connection; the signed token still authorizes each. */
const COVER_PREFIX = '/storage/v1/object/sign/property-photos/';

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

/** Storage needs only the signed token in the query, so the session cookie and any bearer stay on the app origin. */
function rewriteCover(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  return NextResponse.rewrite(new URL(`${pathname}${search}`, env.NEXT_PUBLIC_SUPABASE_URL), { request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith(COVER_PREFIX)) return rewriteCover(request);
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, sessionCookie(options, request.headers));
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (data === null && !isPublicPath(pathname)) return redirectKeepingCookies(request, response, '/sign-in');
  if (data !== null && pathname === '/sign-in') return redirectKeepingCookies(request, response, '/');
  return response;
}

export const config = {
  matcher: ['/storage/v1/object/sign/property-photos/:path*', '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
