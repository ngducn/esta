import 'server-only';
import type { Clock } from '@esta/core';
import { readClock } from '@esta/ops';
import { connection } from 'next/server';
import { cache } from 'react';
import { env } from './env';
import { getCurrentMember } from './member';
import { cookielessAnonClient } from './supabase/server';

/**
 * The clock of the signed-in member's household: its own test clock row, or the global one. A request with no
 * session reads the global one. Route handlers use this because they are dynamic already; they skip `getClock`,
 * since `connection()` threw "called outside a request scope" from the cron route under load in local CI (#53).
 */
export async function readRequestClock(): Promise<Clock> {
  return readClock(cookielessAnonClient, env, (await getCurrentMember())?.household.id);
}

/** The cron routes serve every household at once, so they read the global row. */
export function readGlobalClock(): Promise<Clock> {
  return readClock(cookielessAnonClient, env);
}

export const getClock = cache(async (): Promise<Clock> => {
  await connection();
  return readRequestClock();
});
