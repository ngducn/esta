import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { heartbeatReadBound } from '@esta/core/agent';
import { usageByKind, type KindUsage } from '@esta/core/agent-usage';
import { z } from 'zod';
import { jobStatuses } from '@/server/assistant';
import { createSessionClient } from '@/server/supabase/server';

const DAY_MS = 86_400_000;

/** A run's outcome: its job's status for the job's newest run, `retried` for an attempt the job ran again after. */
export type RunStatus = (typeof jobStatuses)[number] | 'retried';

export type DiagnosticRun = {
  readonly id: string;
  readonly kind: string;
  readonly status: RunStatus;
  readonly startedAt: Instant;
  readonly durationMs: number | null;
  readonly model: string | null;
  readonly numTurns: number | null;
  readonly costUsd: number | null;
  readonly toolCalls: Readonly<Record<string, number>>;
};

export type HeldNote = { readonly id: string; readonly kind: string | null; readonly createdAt: Instant };

export type Diagnostics = {
  /** The newest worker's credential and mode as of the clock, from `public.worker_modes`, which answers only operators. */
  readonly worker: { readonly authMode: string; readonly agentMode: string } | null;
  readonly runs: readonly DiagnosticRun[];
  /** The notes the number guard held back in the last 7 days (AGENT.md §6.3). */
  readonly held: readonly HeldNote[];
  readonly usage: readonly KindUsage[];
};

const job = z.object({ kind: z.string(), status: z.enum(jobStatuses) });
const jobKind = z.object({ kind: z.string() });
const toolCalls = z.record(z.string(), z.number().int().nonnegative()).catch({});
const tokens = z.object({ usage: z.object({ input_tokens: z.number().catch(0), output_tokens: z.number().catch(0) }) }).catch({ usage: { input_tokens: 0, output_tokens: 0 } });

/** Operator diagnostics for one household. RLS returns no run or job to anyone else, and the page asks only for operators. */
export async function loadDiagnostics(householdId: string, now: Instant): Promise<Diagnostics> {
  const supabase = await createSessionClient();
  const weekAgo = new Date(Date.parse(now) - 7 * DAY_MS).toISOString();
  const runColumns = 'id, job_id, started_at, finished_at, model, num_turns, cost_estimate_usd, tool_calls, usage, agent_jobs(kind, status)';
  const [modes, recent, week, held] = await Promise.all([
    supabase.rpc('worker_modes', { p_household_id: householdId, p_seen_by: heartbeatReadBound(now) }),
    supabase.from('agent_runs').select(runColumns).eq('household_id', householdId).lte('started_at', now).order('started_at', { ascending: false }).order('created_at', { ascending: false }).limit(20),
    supabase.from('agent_runs').select('num_turns, cost_estimate_usd, usage, agent_jobs(kind)').eq('household_id', householdId).gt('started_at', weekAgo).lte('started_at', now).limit(5_000),
    supabase.from('agent_items').select('id, created_at, agent_jobs(kind)').eq('household_id', householdId).like('dedupe_key', 'number\\_guard:%').gt('created_at', weekAgo).order('created_at', { ascending: false }),
  ]);
  for (const read of [modes, recent, week, held]) if (read.error) throw new Error(`Reading the assistant diagnostics failed: ${read.error.message}`);
  const newer = new Set<string>();
  const runs = (recent.data ?? []).map((row): DiagnosticRun => {
    const owner = job.parse(row.agent_jobs);
    const retried = newer.has(row.job_id);
    newer.add(row.job_id);
    return {
      id: row.id,
      kind: owner.kind,
      status: retried ? 'retried' : owner.status,
      startedAt: parseInstant(row.started_at),
      durationMs: row.finished_at === null ? null : Date.parse(row.finished_at) - Date.parse(row.started_at),
      model: row.model,
      numTurns: row.num_turns,
      costUsd: row.cost_estimate_usd,
      toolCalls: toolCalls.parse(row.tool_calls),
    };
  });
  const [worker] = modes.data ?? [];
  return {
    worker: worker === undefined ? null : { authMode: worker.auth_mode, agentMode: worker.agent_mode },
    runs,
    held: (held.data ?? []).map((row) => ({ id: row.id, kind: jobKind.safeParse(row.agent_jobs).data?.kind ?? null, createdAt: parseInstant(row.created_at) })),
    usage: usageByKind(
      (week.data ?? []).map((row) => {
        const { usage } = tokens.parse(row.usage);
        return { kind: jobKind.parse(row.agent_jobs).kind, numTurns: row.num_turns, costUsd: row.cost_estimate_usd, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
      }),
    ),
  };
}
