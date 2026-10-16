import type { Clock, Instant } from '@esta/core';
import type { Tables } from '@esta/db';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RunMode } from './env';
import { jobSpec } from './jobs/registry';
import { canonicalizer } from './replay/canonicalize';
import { MissingRecordingError } from './replay/store';
import { countToolCalls, judgeResult, type Failure, type FailureKind, type Outcome } from './sdk/result';
import { liveSession, replaySession, type SessionRun } from './sdk/session';
import type { AgentDb } from './supabase';
import { buildTools } from './tools/server';

export type AgentJob = Tables<'agent_jobs'>;

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

/** A retry cannot fix a missing recording or a rejected credential (AGT-1). */
const PERMANENT: ReadonlySet<FailureKind> = new Set(['auth_error', 'missing_recording']);

export type NextStep = { readonly status: 'queued'; readonly runAfter: Instant } | { readonly status: 'failed' };

/** `attempts` already counts the attempt that just failed, because the claim increments it. */
export function nextAttempt(job: Pick<AgentJob, 'attempts' | 'max_attempts'>, failure: Failure, asOf: Instant): NextStep {
  if (PERMANENT.has(failure.kind) || job.attempts >= job.max_attempts) return { status: 'failed' };
  const minutes = BACKOFF_MINUTES[Math.min(job.attempts, BACKOFF_MINUTES.length) - 1] ?? BACKOFF_MINUTES[0];
  return { status: 'queued', runAfter: new Date(Date.parse(asOf) + minutes * 60_000).toISOString() as Instant };
}

function failureOf(error: unknown): Failure {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: error instanceof MissingRecordingError ? 'missing_recording' : 'error', message };
}

async function householdName(db: AgentDb, householdId: string): Promise<string> {
  const { data, error } = await db.from('households').select('name').eq('id', householdId).single();
  if (error) throw new Error(`Reading the household failed: ${error.message}`);
  return data.name;
}

async function runSession(worker: Worker, job: AgentJob): Promise<{ outcome: Outcome; session: SessionRun | null }> {
  const spec = jobSpec(job.kind);
  if (spec === undefined) return { outcome: { ok: false, failure: { kind: 'error', message: `Unknown job kind ${job.kind}` } }, session: null };
  mkdirSync(worker.jobsDir, { recursive: true });
  const jobDir = realpathSync(mkdtempSync(join(worker.jobsDir, `${job.kind}-`)));
  try {
    const request = {
      spec,
      prompt: spec.handler.prompt(job.payload),
      jobDir,
      configDir: worker.configDir,
      tools: buildTools(worker.db, job.household_id, spec.mcpTools),
      canon: canonicalizer({ householdName: await householdName(worker.db, job.household_id) }),
    };
    const session =
      worker.mode.agentMode === 'live' ? await liveSession(request, worker.mode) : await replaySession(request, worker.replayDir);
    return { outcome: judgeResult(session.result), session };
  } catch (error) {
    return { outcome: { ok: false, failure: failureOf(error) }, session: null };
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
    await check('Finishing the job', ownJob({ status: 'done', result: spec.handler.result(outcome.reply), error: null, finished_at: finishedAt }));
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
