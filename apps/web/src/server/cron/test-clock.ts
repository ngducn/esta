import 'server-only';
import type { Instant } from '@esta/core';
import type { CronClient } from './supabase';

/** `households` null writes the global row; otherwise one row per household, so specs on other households keep their date. */
export async function setTestClock(client: CronClient, frozenNow: Instant, households: readonly string[] | null): Promise<void> {
  if (households === null) await clearTestClock(client, null);
  const rows = (households ?? [null]).map((for_household) => ({ for_household, frozen_now: frozenNow }));
  // An upsert, because two specs freezing the same lane at once must not collide on its one row.
  const { error } = await client.from('test_clock').upsert(rows, { onConflict: 'for_household', ignoreDuplicates: false });
  if (error) throw new Error(`Setting the test clock failed: ${error.message}`);
}

export async function clearTestClock(client: CronClient, households: readonly string[] | null): Promise<void> {
  const query = client.from('test_clock').delete();
  const { error } = await (households === null ? query.is('for_household', null) : query.in('for_household', [...households]));
  if (error) throw new Error(`Clearing the test clock failed: ${error.message}`);
}
