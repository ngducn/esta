import 'server-only';
import type { Instant } from '@esta/core';
import type { CronClient } from './supabase';

export async function setTestClock(client: CronClient, frozenNow: Instant): Promise<void> {
  const { error } = await client.from('test_clock').upsert({ id: true, frozen_now: frozenNow });
  if (error) throw new Error(`Setting the test clock failed: ${error.message}`);
}

export async function clearTestClock(client: CronClient): Promise<void> {
  const { error } = await client.from('test_clock').delete().eq('id', true);
  if (error) throw new Error(`Clearing the test clock failed: ${error.message}`);
}
