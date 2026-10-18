import type { Clock, Instant } from '@esta/core';
import type { Json } from '@esta/db';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RunMode } from './env';
import { InvalidJobError } from './jobs/extract-document';
import { jobSpec, type AgentJob } from './jobs/registry';
import { canonicalizer } from './replay/canonicalize';
import { MissingRecordingError } from './replay/store';
import { countToolCalls, judgeResult, type Failure, type FailureKind, type Outcome } from './sdk/result';
import { liveSession, replaySession, type SessionRun } from './sdk/session';
import type { AgentDb } from './supabase';
import { mcpToolName } from './tools/server';

export type { AgentJob } from './jobs/registry';

export type Worker = {
  readonly db: AgentDb;
  readonly workerId: string;
  readonly mode: RunMode;
  readonly jobsDir: string;
  readonly configDir: string;
  readonly replayDir: string;
  clock(): Promise<Clock>;
};

const BACKOFF_MINUTES = [1, 5, 25] as const;

/** A retry cannot fix a missing recording, a rejected credential or a job whose rows do not line up (AGT-1). */
const PERMANENT: ReadonlySet<FailureKind> = new Set(['auth_error', 'missing_recording', 'invalid_job']);

export type NextStep = { readonly status: 'queued'; readonly runAfter: Instant } | { readonly status: 'failed' };

/** `attempts` already counts the attempt that just failed, because the claim increments it. */
export function nextAttempt(job: Pick<AgentJob, 'attempts' | 'max_attempts'>, failure: Failure, asOf: Instant): NextStep {
  if (PERMANENT.has(failure.kind) || job.attempts >= job.max_attempts) return { status: 'failed' };
  const minutes = BACKOFF_MINUTES[Math.min(job.attempts, BACKOFF_MINUTES.length) - 1] ?? BACKOFF_MINUTES[0];
  return { status: 'queued', runAfter: new Date(Date.parse(asOf) + minutes * 60_000).toISOString() as Instant };
}

function failureOf(error: unknown): Failure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof MissingRecordingError) return { kind: 'missing_recording', message };
  return { kind: error instanceof InvalidJobError ? 'invalid_job' : 'error', message };
}

type SessionOutcome = { readonly outcome: Outcome & { readonly result?: Json }; readonly session: SessionRun | null };

async function householdName(db: AgentDb, householdId: string): Promise<string> {
  const { data, error } = await db.from('households').select('name').eq('id', householdId).single();
  if (error) throw new Error(`Reading the household failed: ${error.message}`);
  return data.name;
}

/** The job's own directory, `jobs/<job_id>`, emptied first and deleted on every exit path (DOC-5). */
async function runSession(worker: Worker, job: AgentJob): Promise<SessionOutcome> {
  const spec = jobSpec(job.kind);
  if (spec === undefined) return { outcome: { ok: false, failure: { kind: 'error', message: `Unknown job kind ${job.kind}` } }, session: null };
  const jobDir = join(worker.jobsDir, job.id);
  rmSync(jobDir, { recursive: true, force: true });
  mkdirSync(jobDir, { recursive: true });
  let session: SessionRun | null = null;
  try {
    const resolvedDir = realpathSync(jobDir);
    const prepared = await spec.handler.prepare({ db: worker.db, job, jobDir: resolvedDir });
    const bound = [...prepared.tools.keys()].toSorted().join(',');
    if (bound !== spec.mcpTools.map(mcpToolName).toSorted().join(',')) throw new Error(`${job.kind} bound the tools ${bound}, not its kind's`);
    const request = {
      spec,
      prompt: prepared.prompt,
      jobDir: resolvedDir,
      configDir: worker.configDir,
      tools: prepared.tools,
      canon: canonicalizer({ householdName: await householdName(worker.db, job.household_id), jobDir: resolvedDir }),
    };
    session = worker.mode.agentMode === 'live' ? await liveSession(request, worker.mode) : await replaySession(request, worker.replayDir);
    const outcome = judgeResult(session.result);
    if (!outcome.ok) return { outcome, session };
    return { outcome: { ...outcome, result: await prepared.finish({ reply: outcome.reply, model: session.model }) }, session };
  } catch (error) {
    return { outcome: { ok: false, failure: failureOf(error) }, session };
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
  }
}

async function check(step: string, request: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await request;
  if (error) throw new Error(`${step} failed: ${error.message}`);
}

async function finishJob(worker: Worker, job: AgentJob, startedAt: Instant): Promise<Outcome> {
  const { outcome, session } = await runSession(worker, job);
  const finishedAt = (await worker.clock()).now();
  const { mode, db } = worker;
  await check(
    'Writing the run',
    db.from('agent_runs').insert({
      household_id: job.household_id,
      job_id: job.id,
      auth_mode: mode.authMode,
      agent_mode: mode.agentMode,
      model: session?.model ?? (mode.agentMode === 'live' ? mode.model : null),
      num_turns: session?.result.numTurns ?? null,
      session_id: session?.result.sessionId ?? null,
      cost_estimate_usd: session?.result.costUsd ?? 0,
      usage: session
        ? { usage: session.result.usage, model_usage: session.result.modelUsage, permission_denials: session.result.permissionDenials }
        : {},
      tool_calls: countToolCalls(session?.toolCalls.map((call) => call.name) ?? []),
      started_at: startedAt,
      finished_at: finishedAt,
    }),
  );

  const spec = jobSpec(job.kind);
  const ownJob = (update: Partial<AgentJob>) =>
    db.from('agent_jobs').update(update).eq('id', job.id).eq('locked_by', worker.workerId).eq('status', 'running');
  if (outcome.ok && spec !== undefined) {
    await check('Finishing the job', ownJob({ status: 'done', result: outcome.result ?? null, error: null, finished_at: finishedAt }));
    return outcome;
  }
  const failure = outcome.ok ? { kind: 'error' as const, message: `Unknown job kind ${job.kind}` } : outcome.failure;
  const next = nextAttempt(job, failure, finishedAt);
  await check(
    'Failing the job',
    next.status === 'queued'
      ? ownJob({ status: 'queued', run_after: next.runAfter, error: failure.message, locked_by: null, locked_at: null })
      : ownJob({ status: 'failed', error: failure.message, finished_at: finishedAt }),
  );
  if (next.status === 'failed') await spec?.handler.onFailed?.({ db, job }, failure.message);
  return { ok: false, failure };
}

export async function pollOnce(worker: Worker): Promise<boolean> {
  const asOf = (await worker.clock()).now();
  const { data, error } = await worker.db.rpc('claim_agent_job', { worker_id: worker.workerId, p_as_of: asOf });
  if (error) throw new Error(`Claiming a job failed: ${error.message}`);
  const job = data[0];
  if (job === undefined) return false;
  const outcome = await finishJob(worker, job, asOf);
  console.log(`[agent] ${job.kind} ${job.id} attempt ${job.attempts}: ${outcome.ok ? 'done' : outcome.failure.kind}`);
  return true;
}
