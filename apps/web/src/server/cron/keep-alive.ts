import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import type { CronClient } from './supabase';

export async function keepAlive(client: CronClient, clock: Clock): Promise<{ ok: true; as_of: IsoDate }> {
  const { error } = await client.from('households').select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Keep-alive query failed: ${error.message}`);
  return { ok: true, as_of: clock.today() };
}
