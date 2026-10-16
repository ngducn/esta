import { clockAt, parseInstant, resolveClockSource, type Clock } from '@esta/core';
import type { AgentEnv } from './env';
import type { AgentDb } from './supabase';

/** Read at every heartbeat and every job, so a test can move the clock without restarting the worker (FND-9). */
export async function readClock(db: AgentDb, env: Pick<AgentEnv, 'ESTA_ENV' | 'ESTA_FROZEN_NOW' | 'ESTA_TIMEZONE'>): Promise<Clock> {
  let testClockRow: { frozen_now: string } | null = null;
  if (env.ESTA_ENV !== 'production') {
    const { data, error } = await db.from('test_clock').select('frozen_now').maybeSingle();
    if (error) throw new Error(`Reading test_clock failed: ${error.message}`);
    testClockRow = data;
  }
  const source = resolveClockSource({
    estaEnv: env.ESTA_ENV,
    testClockRow,
    frozenNowEnv: env.ESTA_FROZEN_NOW,
    systemNow: parseInstant(new Date().toISOString()),
  });
  return clockAt(source, env.ESTA_TIMEZONE);
}
