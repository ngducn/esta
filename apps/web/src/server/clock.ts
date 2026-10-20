import 'server-only';
import type { Clock } from '@esta/core';
import { readClock } from '@esta/ops';
import { connection } from 'next/server';
import { cache } from 'react';
import { env } from './env';
import { cookielessAnonClient } from './supabase/server';

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
