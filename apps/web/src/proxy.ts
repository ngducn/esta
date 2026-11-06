import type { Database } from '@esta/db';
import { idSchema, readMembership } from '@esta/ops';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { can } from '@/server/access';
import { openLinkTarget } from '@/server/agent/open-link';
import { parseEnv } from '@/server/env-schema';
import { isAuthPage, isPublicPath } from '@/server/public-paths';
import { hiddenWithout } from '@/server/route-access';
import { RETURN_COOKIE, RETURN_MAX_AGE_SECONDS, safeReturnPath } from '@/server/return-path';
import { buildCsp } from '@/server/security/csp';
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

/** A signed-out visit to a page remembers where it was going for 30 minutes, so a notice's link opens its note after sign-in. A background fetch of a page leaves no trace. */
function redirectToSignIn(request: NextRequest, from: NextResponse): NextResponse {
  const redirect = redirectKeepingCookies(request, from, '/sign-in');
  const { pathname, search } = request.nextUrl;
  const target = safeReturnPath(`${pathname}${search}`);
  const opensPage = request.headers.get('sec-fetch-mode') === 'navigate' && request.headers.get('sec-fetch-dest') === 'document';
  if (request.method === 'GET' && opensPage && target !== null && target !== '/') {
    redirect.cookies.set(RETURN_COOKIE, target, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: RETURN_MAX_AGE_SECONDS, secure: request.nextUrl.protocol === 'https:' });
  }
  return redirect;
}

/** Storage's own headers win over same-named ones, so the CDN-specific pair is what keeps a private preview out of a shared cache; `private` still lets the phone keep its own copy. */
function noStore(response: NextResponse): NextResponse {
  response.headers.set('cache-control', 'private');
  response.headers.set('cdn-cache-control', 'no-store');
  response.headers.set('vercel-cdn-cache-control', 'no-store');
  return response;
}

/** Storage needs only the signed token in the query, so the session cookie and any bearer stay on the app origin. Only reads get through. */
function rewriteSigned(request: NextRequest): NextResponse {
  if (request.method !== 'GET' && request.method !== 'HEAD') return noStore(new NextResponse(null, { status: 405, headers: { allow: 'GET, HEAD' } }));
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  return noStore(NextResponse.rewrite(new URL(`${pathname}${search}`, env.NEXT_PUBLIC_SUPABASE_URL), { request: { headers } }));
}

type Session = { readonly supabase: SupabaseClient<Database>; readonly userId: string };

/** A page whose `notFound()` this member may get, and whether they get it for the path's first capture. */
type GuardedPage = { readonly path: RegExp; hidden(session: Session, capture: string | undefined): Promise<boolean> };

function recordPage(path: RegExp, routes: readonly string[], find: (supabase: SupabaseClient<Database>, id: string) => PromiseLike<{ readonly data: unknown; readonly error: unknown }>): GuardedPage {
  return {
    path,
    async hidden({ supabase }, id) {
      if (id === undefined || routes.includes(id)) return false;
      if (!z.uuid().safeParse(id).success) return true;
      const { data, error } = await find(supabase, id);
      return error === null && data === null;
    },
  };
}

/** Hỏi and its saved conversation links now open the thread, as a redirect before any page streams (P5-12). */
const ASK_PAGES = /^\/assistant\/ask(?:\/[^/]+)?\/?$/;

const GUARDED_PAGES: readonly GuardedPage[] = [
  recordPage(/^\/properties\/([^/]+)(?:\/|$)/, ['new', 'archived'], (supabase, id) => supabase.from('property_list_rows').select('id').eq('id', id).maybeSingle()),
  recordPage(/^\/assistant\/ask\/([^/]+)$/, [], (supabase, id) => supabase.from('conversations').select('id').eq('id', id).maybeSingle()),
  {
    path: /^\/tenants\/([^/]+)\/?$/,
    async hidden({ supabase }, id) {
      const party = idSchema.safeParse(id);
      if (!party.success) return true;
      const { data, error } = await supabase.from('parties').select('id').eq('id', party.data).contains('tags', ['tenant']).maybeSingle();
      return error === null && data === null;
    },
  },
  { path: /^\/open\/([^/]+\/[^/]+)$/, hidden: async ({ supabase }, link = '') => openLinkTarget(supabase, link).then((target) => target === null, () => false) },
];

/**
 * Every page under (app) streams below a loading boundary, so a page's notFound() arrives after the 200 is sent.
 * A document request for a record this member cannot read, or an operator page they cannot open, gets its 404 here
 * instead; the page still renders the not-found screen. Client navigations (the rsc header) skip the query, because
 * their status is never shown.
 */
async function isHiddenPage(request: NextRequest, session: Session): Promise<boolean> {
  if (request.headers.has('rsc')) return false;
  const needs = hiddenWithout(request.nextUrl.pathname);
  if (needs !== null) {
    const membership = await readMembership(session.supabase, session.userId);
    if (membership === null || !can({ role: membership.role, isOperator: membership.is_operator }, needs)) return true;
  }
  for (const page of GUARDED_PAGES) {
    const match = page.path.exec(request.nextUrl.pathname);
    if (match !== null) return page.hidden(session, match[1]);
  }
  return false;
}

/** Next reads the nonce from the request's CSP header and puts it on its own scripts. */
function withCsp(request: NextRequest): string {
  const nonce = btoa(crypto.randomUUID());
  const policy = buildCsp({ nonce, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, development: process.env.NODE_ENV !== 'production' });
  request.headers.set('content-security-policy', policy);
  return policy;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SIGNED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return rewriteSigned(request);
  const policy = withCsp(request);
  const response = await handle(request, pathname);
  response.headers.set('content-security-policy', policy);
  return response;
}

async function handle(request: NextRequest, pathname: string): Promise<NextResponse> {
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
  if (data === null && !isPublicPath(pathname)) return redirectToSignIn(request, response);
  if (data !== null && isAuthPage(pathname)) return redirectKeepingCookies(request, response, '/');
  if (data !== null && (await isHiddenPage(request, { supabase, userId: data.claims.sub }))) return new NextResponse(null, { status: 404, headers: response.headers });
  if (data !== null && ASK_PAGES.test(pathname)) return redirectKeepingCookies(request, response, '/assistant');
  return response;
}

export const config = {
  matcher: ['/storage/v1/object/sign/property-photos/:path*', '/storage/v1/object/sign/documents/:path*', '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
