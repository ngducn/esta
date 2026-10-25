import type { Database } from '@esta/db';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { parseEnv } from '@/server/env-schema';
import { isAuthPage, isPublicPath } from '@/server/public-paths';
import { sessionCookie } from '@/server/supabase/session';

const env = parseEnv(process.env);

/**
 * Covers and document previews load from the app's own origin, so a phone reuses the page's connection; the signed
 * token still authorizes each.
 */
const SIGNED_PREFIXES = ['/storage/v1/object/sign/property-photos/', '/storage/v1/object/sign/documents/'];

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

/** Storage needs only the signed token in the query, so the session cookie and any bearer stay on the app origin. */
function rewriteSigned(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  return NextResponse.rewrite(new URL(`${pathname}${search}`, env.NEXT_PUBLIC_SUPABASE_URL), { request: { headers } });
}

type RecordPage = {
  readonly path: RegExp;
  readonly routes: ReadonlySet<string>;
  find(supabase: SupabaseClient<Database>, id: string): PromiseLike<{ readonly data: unknown; readonly error: unknown }>;
};

const RECORD_PAGES: readonly RecordPage[] = [
  { path: /^\/properties\/([^/]+)(?:\/|$)/, routes: new Set(['new', 'archived']), find: (supabase, id) => supabase.from('property_list_rows').select('id').eq('id', id).maybeSingle() },
  { path: /^\/assistant\/ask\/([^/]+)$/, routes: new Set(), find: (supabase, id) => supabase.from('conversations').select('id').eq('id', id).maybeSingle() },
];

/**
 * Every page under (app) streams below a loading boundary, so a page's notFound() arrives after the 200 is sent.
 * A document request for a record this member cannot read gets its 404 here instead; the page still renders the
 * not-found screen. Client navigations (the rsc header) skip the query, because their status is never shown.
 */
async function isMissingRecord(request: NextRequest, supabase: SupabaseClient<Database>): Promise<boolean> {
  if (request.headers.has('rsc')) return false;
  for (const page of RECORD_PAGES) {
    const id = page.path.exec(request.nextUrl.pathname)?.[1];
    if (id === undefined || page.routes.has(id)) continue;
    if (!z.uuid().safeParse(id).success) return true;
    const { data, error } = await page.find(supabase, id);
    return error === null && data === null;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SIGNED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return rewriteSigned(request);
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
  if (data !== null && isAuthPage(pathname)) return redirectKeepingCookies(request, response, '/');
  if (data !== null && (await isMissingRecord(request, supabase))) return new NextResponse(null, { status: 404, headers: response.headers });
  return response;
}

export const config = {
  matcher: ['/storage/v1/object/sign/property-photos/:path*', '/storage/v1/object/sign/documents/:path*', '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
