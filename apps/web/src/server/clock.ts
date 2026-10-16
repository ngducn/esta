import 'server-only';
import { clockAt, parseInstant, resolveClockSource, type Clock } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient } from '@supabase/supabase-js';
import { connection } from 'next/server';
import { cache } from 'react';
import { env } from './env';
import type { Env } from './env-schema';

type TestClockRow = { frozen_now: string };
export type ReadTestClockRow = () => Promise<TestClockRow | null>;

const cookielessAnonClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readTestClockRow(): Promise<TestClockRow | null> {
  const { data, error } = await cookielessAnonClient.from('test_clock').select('frozen_now').maybeSingle();
  if (error) throw new Error(`Reading test_clock failed: ${error.message}`);
  return data;
}

export async function readClock(
  config: Pick<Env, 'ESTA_ENV' | 'ESTA_FROZEN_NOW' | 'ESTA_TIMEZONE'>,
  readRow: ReadTestClockRow,
): Promise<Clock> {
  const testClockRow = config.ESTA_ENV === 'production' ? null : await readRow();
  const source = resolveClockSource({
    estaEnv: config.ESTA_ENV,
    testClockRow,
    frozenNowEnv: config.ESTA_FROZEN_NOW,
    systemNow: parseInstant(new Date().toISOString()),
  });
  return clockAt(source, config.ESTA_TIMEZONE);
}

/**
 * For route handlers, which are dynamic already. They skip `getClock`: `connection()` threw "called outside a
 * request scope" from the cron route under load in local CI (#53).
 */
export function readRequestClock(): Promise<Clock> {
  return readClock(env, readTestClockRow);
}

export const getClock = cache(async (): Promise<Clock> => {
  await connection();
  return readRequestClock();
});
