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

export type AgentRun = {
  readonly id: string;
  readonly startedAt: Instant;
  readonly authMode: string;
  readonly agentMode: string;
  readonly model: string | null;
  readonly numTurns: number | null;
  readonly costUsd: number | null;
  readonly toolCalls: Readonly<Record<string, number>>;
};

const pingResult = z.object({ reply: z.string() });
const watchResult = z.object({ notes: z.array(z.object({ added: z.boolean() })) });
const toolCalls = z.record(z.string(), z.number().int().nonnegative());
const jobStatus = z.enum(jobStatuses);

/** Operator diagnostics. RLS returns no row to anyone else, and the page asks only for operators (PLT-1). */
export async function getConnectionCheck(householdId: string): Promise<{ latest: PingCheck | null; watch: WatchCheck | null; runs: readonly AgentRun[] }> {
  const supabase = await createSessionClient();
  const latestOf = (kind: 'ping' | 'portfolio_watch') =>
    supabase.from('agent_jobs').select('status, result, error, run_after').eq('household_id', householdId).eq('kind', kind).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const [jobs, watchJobs, runs] = await Promise.all([
    latestOf('ping'),
    latestOf('portfolio_watch'),
    supabase
      .from('agent_runs')
      .select('id, started_at, auth_mode, agent_mode, model, num_turns, cost_estimate_usd, tool_calls')
      .eq('household_id', householdId)
      .order('started_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  if (jobs.error) throw new Error(`Reading the connection check failed: ${jobs.error.message}`);
  if (watchJobs.error) throw new Error(`Reading the watch run failed: ${watchJobs.error.message}`);
  const watch = watchJobs.data;
  if (runs.error) throw new Error(`Reading the agent runs failed: ${runs.error.message}`);
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
    runs: runs.data.map((run) => ({
      id: run.id,
      startedAt: parseInstant(run.started_at),
      authMode: run.auth_mode,
      agentMode: run.agent_mode,
      model: run.model,
      numTurns: run.num_turns,
      costUsd: run.cost_estimate_usd,
      toolCalls: toolCalls.safeParse(run.tool_calls).data ?? {},
    })),
  };
}
