import type { Clock } from '@esta/core';
import { planScheduledJobs, scheduleKey } from '@esta/core/agent-schedule';
import { SCHEDULED_JOBS } from './jobs/registry';
import type { AgentDb } from './supabase';

export const SCHEDULER_INTERVAL_MS = 60_000;

/** Lower runs first, so a ping or a document a person just queued never waits behind every household's daily jobs. */
export const SCHEDULED_PRIORITY = 200;

/** Queues today's scheduled jobs whose time has come for every household; returns how many it added (AGENT.md §2.1). */
export async function scheduleJobs(db: AgentDb, clock: Clock, timezone: string): Promise<number> {
  const households = await db.from('households').select('id').order('id');
  if (households.error) throw new Error(`Reading the households failed: ${households.error.message}`);
  const householdIds = households.data.map((household) => household.id);
  const today = clock.today();
  const keys = SCHEDULED_JOBS.flatMap((job) => householdIds.map((id) => scheduleKey(job, id, today)));
  const existing = await db.from('agent_jobs').select('idempotency_key').in('idempotency_key', keys);
  if (existing.error) throw new Error(`Reading today's jobs failed: ${existing.error.message}`);
  const planned = planScheduledJobs(SCHEDULED_JOBS, { householdIds, now: clock.now(), timezone, existingKeys: new Set(existing.data.map((row) => row.idempotency_key ?? '')) });
  if (planned.length === 0) return 0;
  // Two workers can plan the same job; the key keeps one, and the other's insert does nothing.
  const { data, error } = await db
    .from('agent_jobs')
    .upsert(
      planned.map((job) => ({ household_id: job.householdId, kind: job.kind, run_after: job.runAfter, idempotency_key: job.idempotencyKey, priority: SCHEDULED_PRIORITY })),
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(`Queueing the scheduled jobs failed: ${error.message}`);
  return data.length;
}

/** Reads the clock at every tick, so moving the test clock schedules the new day without a restart (FND-9). */
export function startScheduler(db: AgentDb, timezone: string, clock: () => Promise<Clock>, onError: (error: unknown) => void): () => void {
  const tick = () => {
    clock()
      .then((current) => scheduleJobs(db, current, timezone))
      .then((added) => {
        if (added > 0) console.log(`[agent] scheduled ${added} jobs`);
      })
      .catch(onError);
  };
  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  return () => clearInterval(timer);
}
