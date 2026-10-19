import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import { cronHandler } from './handler';
import type { CronClient } from './supabase';

export type LeaseStatusRun = { ok: true; as_of: IsoDate; ended: number };

/** LSE-2: one statement ends every household's leases whose last day is before today. */
export async function endExpiredLeases(client: CronClient, clock: Clock): Promise<LeaseStatusRun> {
  const asOf = clock.today();
  const { data, error } = await client.rpc('end_expired_leases', { p_as_of: asOf });
  if (error) throw new Error(`Ending expired leases failed: ${error.message}`);
  return { ok: true, as_of: asOf, ended: data };
}

export const leaseStatusCron = cronHandler(endExpiredLeases);
