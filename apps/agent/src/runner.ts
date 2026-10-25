import type { Clock, Instant } from '@esta/core';
import type { Json } from '@esta/db';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { RunMode } from './env';
import { InvalidJobError } from './jobs/extract-document';
import { jobSpec, type AgentJob } from './jobs/registry';
import { canonicalizer } from './replay/canonicalize';
import { MissingRecordingError } from './replay/store';
import { countToolCalls, judgeResult, type Failure, type FailureKind, type Outcome } from './sdk/result';
import { liveSession, replaySession, type SessionRun } from './sdk/session';
import type { AgentDb } from './supabase';
import { NumberGuardError } from './tools/create-item';
import { mcpToolName } from './tools/server';

export type { AgentJob } from './jobs/registry';

export type Worker = {
  readonly db: AgentDb;
  readonly workerId: string;
  readonly mode: RunMode;
  readonly jobsDir: string;
  readonly configDir: string;
  readonly replayDir: string;
  readonly timezone: string;
  clock(): Promise<Clock>;
};

const BACKOFF_MINUTES = [1, 5, 25] as const;

/** A retry cannot fix a missing recording, a rejected credential, a job whose rows do not line up (AGT-1) or a second guard violation (AGENT.md §6.3). */
const PERMANENT: ReadonlySet<FailureKind> = new Set(['auth_error', 'missing_recording', 'invalid_job', 'number_guard']);

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
  if (error instanceof NumberGuardError) return { kind: 'number_guard', message };
  return { kind: error instanceof InvalidJobError ? 'invalid_job' : 'error', message };
}

type SessionOutcome = { readonly outcome: Outcome & { readonly result?: Json }; readonly session: SessionRun | null };

async function householdName(db: AgentDb, householdId: string): Promise<string> {
  const { data, error } = await db.from('households').select('name').eq('id', householdId).single();
  if (error) throw new Error(`Reading the household failed: ${error.message}`);
  return data.name;
}

type Inputs = { readonly waiting: readonly string[]; readonly failed: readonly string[] };

/** The job's own directory, `jobs/<job_id>`, emptied first and deleted on every exit path (DOC-5). */
async function runSession(worker: Worker, job: AgentJob, { waiting, failed }: Inputs): Promise<SessionOutcome> {
  const spec = jobSpec(job.kind);
  if (spec === undefined) return { outcome: { ok: false, failure: { kind: 'invalid_job', message: `Unknown job kind ${job.kind}` } }, session: null };
  const jobDir = join(worker.jobsDir, job.id);
  rmSync(jobDir, { recursive: true, force: true });
  mkdirSync(jobDir, { recursive: true });
  let session: SessionRun | null = null;
  try {
    const resolvedDir = realpathSync(jobDir);
    const prepared = await spec.handler.prepare({ db: worker.db, job, jobDir: resolvedDir, timezone: worker.timezone, waiting, failed, clock: () => worker.clock() });
    const bound = [...prepared.tools.keys()].toSorted().join(',');
    if (bound !== spec.mcpTools.map(mcpToolName).toSorted().join(',')) throw new Error(`${job.kind} bound the tools ${bound}, not its kind's`);
    const request = {
      spec,
      prompt: prepared.prompt,
      jobDir: resolvedDir,
      configDir: worker.configDir,
      tools: prepared.tools,
      canon: canonicalizer({ householdName: await householdName(worker.db, job.household_id), jobDir: resolvedDir }),
      ...(prepared.caps === undefined ? {} : { caps: prepared.caps }),
      ...(prepared.observe === undefined ? {} : { observe: prepared.observe }),
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

async function finishJob(worker: Worker, job: AgentJob, startedAt: Instant, inputs: Inputs): Promise<Outcome> {
  const { outcome, session } = await runSession(worker, job, inputs);
  const finishedAt = (await worker.clock()).now();
  const { mode, db } = worker;
  const run = await db.from('agent_runs').insert({
    household_id: job.household_id,
    job_id: job.id,
    auth_mode: mode.authMode,
    agent_mode: mode.agentMode,
    model: session?.model ?? (mode.agentMode === 'live' ? mode.model : null),
    num_turns: session?.result.numTurns ?? null,
    session_id: session?.result.sessionId ?? null,
    cost_estimate_usd: session?.result.costUsd ?? 0,
    usage: session ? { usage: session.result.usage, model_usage: session.result.modelUsage, permission_denials: session.result.permissionDenials } : {},
    tool_calls: countToolCalls(session?.toolCalls.map((call) => call.name) ?? []),
    started_at: startedAt,
    finished_at: finishedAt,
  });
  if (run.error) throw new Error(`Writing the run failed: ${run.error.message}`);

  if (outcome.ok) {
    await ownJob(worker, job, 'Finishing the job', { status: 'done', result: outcome.result ?? null, error: null, finished_at: finishedAt });
    return outcome;
  }
  const { failure } = outcome;
  const next = nextAttempt(job, failure, finishedAt);
  if (next.status === 'failed') {
    await failJob(worker, job, failure.message);
    return outcome;
  }
  await ownJob(worker, job, 'Requeueing the job', { status: 'queued', run_after: next.runAfter, error: failure.message, locked_by: null, locked_at: null });
  return outcome;
}

/** Writes the job only while this worker still holds its lock; a worker that reclaimed it owns the job's outcome now. */
async function ownJob(worker: Worker, job: AgentJob, step: string, update: Partial<AgentJob>): Promise<void> {
  const { data, error } = await worker.db.from('agent_jobs').update(update).eq('id', job.id).eq('locked_by', worker.workerId).eq('status', 'running').select('id');
  if (error) throw new Error(`${step} failed: ${error.message}`);
  if (data.length !== 1) throw new Error(`${step} failed: job ${job.id} is no longer locked by this worker`);
}

/**
 * Runs the kind's failure step before the job reads failed, and deletes the job's files, so a worker that stops in
 * between leaves a running job that `claim_abandoned_agent_job` hands to the next worker (AGENT.md §9). The failure
 * step is idempotent.
 */
async function failJob(worker: Worker, job: AgentJob, error: string): Promise<void> {
  rmSync(join(worker.jobsDir, job.id), { recursive: true, force: true });
  await jobSpec(job.kind)?.handler.onFailed?.({ db: worker.db, job, clock: () => worker.clock() }, error);
  await ownJob(worker, job, 'Failing the job', { status: 'failed', error, finished_at: (await worker.clock()).now() });
}

const ABANDONED = 'The worker stopped during the last attempt';

const WAIT_MINUTES = 5;
const MAX_RESCHEDULES = 3;
const payloadSchema = z.record(z.string(), z.json());

async function sameDayInputs(worker: Worker, job: AgentJob, today: string): Promise<Inputs> {
  const kinds = jobSpec(job.kind)?.waitsFor ?? [];
  if (kinds.length === 0) return { waiting: [], failed: [] };
  const { data, error } = await worker.db
    .from('agent_jobs')
    .select('kind, status')
    .in('idempotency_key', kinds.map((kind) => `${kind}:${job.household_id}:${today}`))
    .in('status', ['queued', 'running', 'failed']);
  if (error) throw new Error(`Reading the job's inputs failed: ${error.message}`);
  const withStatus = (statuses: readonly string[]) => kinds.filter((kind) => data.some((row) => row.kind === kind && statuses.includes(row.status)));
  return { waiting: withStatus(['queued', 'running']), failed: withStatus(['failed']) };
}

async function rescheduleForInputs(worker: Worker, job: AgentJob, waiting: readonly string[], asOf: Instant): Promise<boolean> {
  const payload = payloadSchema.parse(job.payload);
  const reschedules = typeof payload.reschedules === 'number' ? payload.reschedules : 0;
  if (waiting.length === 0 || reschedules >= MAX_RESCHEDULES) return false;
  const runAfter = new Date(Date.parse(asOf) + WAIT_MINUTES * 60_000).toISOString();
  await ownJob(worker, job, 'Rescheduling the job', { status: 'queued', run_after: runAfter, attempts: job.attempts - 1, payload: { ...payload, reschedules: reschedules + 1 }, locked_by: null, locked_at: null });
  console.log(`[agent] ${job.kind} ${job.id}: waiting for ${waiting.join(', ')}, runs again at ${runAfter}`);
  return true;
}

export async function pollOnce(worker: Worker): Promise<boolean> {
  const asOf = (await worker.clock()).now();
  const abandoned = await worker.db.rpc('claim_abandoned_agent_job', { worker_id: worker.workerId, p_as_of: asOf });
  if (abandoned.error) throw new Error(`Claiming an abandoned job failed: ${abandoned.error.message}`);
  const stopped = abandoned.data[0];
  if (stopped !== undefined) {
    await failJob(worker, stopped, ABANDONED);
    console.log(`[agent] ${stopped.kind} ${stopped.id} attempt ${stopped.attempts}: failed, its worker stopped`);
    return true;
  }
  const { data, error } = await worker.db.rpc('claim_agent_job', { worker_id: worker.workerId, p_as_of: asOf });
  if (error) throw new Error(`Claiming a job failed: ${error.message}`);
  const job = data[0];
  if (job === undefined) return false;
  const inputs = await sameDayInputs(worker, job, (await worker.clock()).today());
  if (await rescheduleForInputs(worker, job, inputs.waiting, asOf)) return true;
  const outcome = await finishJob(worker, job, asOf, inputs);
  console.log(`[agent] ${job.kind} ${job.id} attempt ${job.attempts}: ${outcome.ok ? 'done' : outcome.failure.kind}`);
  return true;
}
