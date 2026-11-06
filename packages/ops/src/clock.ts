import { clockAt, parseInstant, resolveClockSource, type Clock } from '@esta/core';
import type { Db } from './db';

export type ClockEnv = { readonly ESTA_ENV?: string | undefined; readonly ESTA_FROZEN_NOW?: string | undefined; readonly ESTA_TIMEZONE: string };

/**
 * Read at every job and every tool call, so a test can move the clock without restarting the process (FND-9). A
 * household's own test clock row wins over the global one, which is what a caller with no household reads.
 */
export async function readClock(db: Db, env: ClockEnv, householdId?: string): Promise<Clock> {
  let testClockRow: { frozen_now: string } | null = null;
  if (env.ESTA_ENV !== 'production') {
    const scope = householdId === undefined ? 'for_household.is.null' : `for_household.eq.${householdId},for_household.is.null`;
    const { data, error } = await db.from('test_clock').select('for_household, frozen_now').or(scope);
    if (error) throw new Error(`Reading test_clock failed: ${error.message}`);
    testClockRow = data.find((row) => row.for_household === householdId) ?? data.find((row) => row.for_household === null) ?? null;
  }
  const source = resolveClockSource({
    estaEnv: env.ESTA_ENV,
    testClockRow,
    frozenNowEnv: env.ESTA_FROZEN_NOW,
    systemNow: parseInstant(new Date().toISOString()),
  });
  return clockAt(source, env.ESTA_TIMEZONE);
}
