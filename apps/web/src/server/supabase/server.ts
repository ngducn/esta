import 'server-only';
import type { Database } from '@esta/db';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { env } from '@/server/env';
import { sessionCookie } from './session';

export async function createSessionClient() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
