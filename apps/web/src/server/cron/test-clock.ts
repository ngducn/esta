import 'server-only';
import type { Instant } from '@esta/core';
import type { CronClient } from './supabase';

/**
 * `households` null writes the global row; otherwise one row per household, so specs on other households keep their date.
 * The global row is updated in place and inserted only when absent: a delete then insert left a gap in which the agent
 * worker, which reads that row on every beat, fell back to ESTA_FROZEN_NOW and claimed jobs on the wrong day.
 */
export async function setTestClock(client: CronClient, frozenNow: Instant, households: readonly string[] | null): Promise<void> {
  if (households === null) return setGlobalTestClock(client, frozenNow);
  const rows = households.map((for_household) => ({ for_household, frozen_now: frozenNow }));
  // An upsert, because two specs freezing the same lane at once must not collide on its one row.
  const { error } = await client.from('test_clock').upsert(rows, { onConflict: 'for_household', ignoreDuplicates: false });
  if (error) throw new Error(`Setting the test clock failed: ${error.message}`);
}

async function setGlobalTestClock(client: CronClient, frozenNow: Instant): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await client.from('test_clock').update({ frozen_now: frozenNow }).is('for_household', null).select('for_household');
    if (updated.error) throw new Error(`Setting the test clock failed: ${updated.error.message}`);
    if (updated.data.length > 0) return;
    const inserted = await client.from('test_clock').insert({ for_household: null, frozen_now: frozenNow });
    if (!inserted.error) return;
    // A second writer inserted the global row first: update it on the next pass.
    if (inserted.error.code !== '23505') throw new Error(`Setting the test clock failed: ${inserted.error.message}`);
  }
  throw new Error('Setting the test clock failed: the global row kept appearing and vanishing');
}

export async function clearTestClock(client: CronClient, households: readonly string[] | null): Promise<void> {
  const query = client.from('test_clock').delete();
  const { error } = await (households === null ? query.is('for_household', null) : query.in('for_household', [...households]));
  if (error) throw new Error(`Clearing the test clock failed: ${error.message}`);
}
