import type { Database } from '@esta/db';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseEnv } from '@/server/env-schema';
import { isPublicPath } from '@/server/public-paths';
import { sessionCookie } from '@/server/supabase/session';

const env = parseEnv(process.env);

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export async function proxy(request: NextRequest) {
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
  const { pathname } = request.nextUrl;
  if (data === null && !isPublicPath(pathname)) return redirectKeepingCookies(request, response, '/sign-in');
  if (data !== null && pathname === '/sign-in') return redirectKeepingCookies(request, response, '/');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
