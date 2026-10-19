import { clockAt, parseInstant, resolveClockSource, type Clock } from '@esta/core';
import type { Db } from './db';

export type ClockEnv = { readonly ESTA_ENV?: string | undefined; readonly ESTA_FROZEN_NOW?: string | undefined; readonly ESTA_TIMEZONE: string };

/** Read at every job and every tool call, so a test can move the clock without restarting the process (FND-9). */
export async function readClock(db: Db, env: ClockEnv): Promise<Clock> {
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
