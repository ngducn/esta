import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { heartbeatReadBound, type Heartbeat } from '@esta/core/agent';
import type { Tables } from '@esta/db';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

/**
 * The newest heartbeat of any worker as of the clock, allowing for a worker host a few seconds ahead;
 * members may read only `worker_id`, `last_seen_at` and `state`.
 */
export async function getWorkerHeartbeat(asOf: Instant): Promise<Heartbeat | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('worker_heartbeats')
    .select('last_seen_at, state')
    .lte('last_seen_at', heartbeatReadBound(asOf))
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the worker heartbeat failed: ${error.message}`);
  return data === null ? null : { lastSeenAt: parseInstant(data.last_seen_at), usageLimited: data.state === 'usage_limited' };
}

export type JobStatus = Tables<'agent_jobs'>['status'];

export const jobStatuses = ['queued', 'running', 'done', 'failed', 'cancelled'] as const satisfies readonly JobStatus[];

export type PingCheck = {
  readonly status: (typeof jobStatuses)[number];
  readonly reply: string | null;
  readonly error: string | null;
  readonly requestedAt: Instant;
};

/** The latest portfolio_watch job: whether it ran, why it failed, and how many new notes it wrote. */
export type WatchCheck = Omit<PingCheck, 'reply'> & { readonly notesAdded: number | null };

const pingResult = z.object({ reply: z.string() });
const watchResult = z.object({ notes: z.array(z.object({ added: z.boolean() })) });
const jobStatus = z.enum(jobStatuses);

/** The operator's connection check and watch run. RLS returns no job to anyone else, and the page asks only for operators (PLT-1). */
export async function getConnectionCheck(householdId: string): Promise<{ latest: PingCheck | null; watch: WatchCheck | null }> {
  const supabase = await createSessionClient();
  const latestOf = (kind: 'ping' | 'portfolio_watch') =>
    supabase.from('agent_jobs').select('status, result, error, run_after').eq('household_id', householdId).eq('kind', kind).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const [jobs, watchJobs] = await Promise.all([latestOf('ping'), latestOf('portfolio_watch')]);
  if (jobs.error) throw new Error(`Reading the connection check failed: ${jobs.error.message}`);
  if (watchJobs.error) throw new Error(`Reading the watch run failed: ${watchJobs.error.message}`);
  const watch = watchJobs.data;
  const job = jobs.data;
  return {
    latest:
      job === null
        ? null
        : {
            status: jobStatus.parse(job.status),
            reply: pingResult.safeParse(job.result).data?.reply ?? null,
            error: job.error,
            requestedAt: parseInstant(job.run_after),
          },
    watch:
      watch === null
        ? null
        : {
            status: jobStatus.parse(watch.status),
            error: watch.error,
            requestedAt: parseInstant(watch.run_after),
            notesAdded: watchResult.safeParse(watch.result).data?.notes.filter((note) => note.added).length ?? null,
          },
  };
}
