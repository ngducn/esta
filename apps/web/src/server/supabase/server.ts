import 'server-only';
import type { Database } from '@esta/db';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';
import { sessionCookie } from './session';

const SHELL_TABLES = ['household_members', 'worker_heartbeats'];

const failedReads: typeof fetch = (input, init) => {
  const { pathname } = new URL(input instanceof Request ? input.url : String(input));
  const read = (init?.method ?? 'GET') === 'GET' && pathname.startsWith('/rest/v1/') && !SHELL_TABLES.some((table) => pathname === `/rest/v1/${table}`);
  return read ? Promise.reject(new TypeError('fetch failed')) : fetch(input, init);
};

export async function createSessionClient() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const faulty = isDevSurfaceEnabled(env) && cookieStore.get('esta_fault')?.value === 'reads';
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...(faulty ? { global: { fetch: failedReads } } : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, sessionCookie(options, requestHeaders));
        } catch {
          // Server components cannot set cookies; the proxy refreshes the session on the next request.
        }
      },
    },
  });
}

/** Signed out and cookieless: reads that need no member, such as the test clock and a bill's shared QR link. */
export const cookielessAnonClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The SSR client always runs PKCE and would leave code-verifier cookies behind, which an email code never uses. */
export function createCodeSender() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
