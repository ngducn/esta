import 'server-only';
import type { Clock } from '@esta/core';
import type { Database } from '@esta/db';
import { readClock } from '@esta/ops';
import { createClient } from '@supabase/supabase-js';
import { connection } from 'next/server';
import { cache } from 'react';
import { env } from './env';

const cookielessAnonClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * For route handlers, which are dynamic already. They skip `getClock`: `connection()` threw "called outside a
 * request scope" from the cron route under load in local CI (#53).
 */
export function readRequestClock(): Promise<Clock> {
  return readClock(cookielessAnonClient, env);
}

export const getClock = cache(async (): Promise<Clock> => {
  await connection();
  return readRequestClock();
});
