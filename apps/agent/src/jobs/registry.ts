import type { Clock } from '@esta/core';
import type { DailyJob } from '@esta/core/agent-schedule';
import type { Json, Tables } from '@esta/db';
import type { AgentDb } from '../supabase';
import type { EstaToolName, EstaTools } from '../tools/server';
import { failExtractDocument, prepareExtractDocument } from './extract-document';
import { preparePing } from './ping';
import { prepareMorningBrief } from './morning-brief';
import { preparePortfolioWatch } from './portfolio-watch';

export type ModelRole = 'routine' | 'deep';

export type AgentJob = Tables<'agent_jobs'>;

export type JobContext = {
  readonly db: AgentDb;
  readonly job: AgentJob;
  /** Already resolved through symlinks, empty, and deleted after the job on every exit path. */
  readonly jobDir: string;
  /** The business timezone, which dates a row the way the clock's `today` does. */
  readonly timezone: string;
  /** The kinds in the spec's `waitsFor` still queued or running today when the job stopped waiting for them. */
  readonly waiting: readonly string[];
  /** The worker's clock, read when a row's time is written, so a frozen test clock dates it (FND-9). */
  clock(): Promise<Clock>;
};

export type PreparedJob = {
  readonly prompt: string;
  /** Exactly the kind's `mcpTools`, each bound to the job's household. */
  readonly tools: EstaTools;
  /** Checks the job's effects and returns `agent_jobs.result`; throws when the model did not do the task. */
  finish(run: { readonly reply: string; readonly model: string }): Promise<Json>;
};

export type JobSpec = {
  readonly kind: string;
  /** Claude Code built-in tools the SDK may offer; `[]` offers none (S1 correction 2). */
  readonly builtInTools: readonly string[];
  readonly mcpTools: readonly EstaToolName[];
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly modelRole: ModelRole;
  /** A job the scheduler queues for every household once a day at `HH:mm` in the business timezone (AGENT.md §3). */
  readonly schedule?: { readonly daily: string };
  /** Daily kinds whose same-day job must finish first; the runner reschedules the job while one is queued or running (AGENT.md §3). */
  readonly waitsFor?: readonly string[];
  readonly handler: {
    prepare(context: JobContext): Promise<PreparedJob>;
    /** Runs once the job has no attempt left, so the household sees the failure (AGENT.md §9). */
    onFailed?(context: Pick<JobContext, 'db' | 'job' | 'clock'>, error: string): Promise<void>;
  };
};

/** Timeouts mirror `private.agent_job_timeout` in SQL, which reclaims a crashed worker's job (AGENT.md §3). */
export const JOBS = {
  ping: {
    kind: 'ping',
    builtInTools: [],
    mcpTools: ['household_info'],
    maxTurns: 3,
    timeoutMs: 60_000,
    modelRole: 'routine',
    handler: { prepare: preparePing },
  },
  extract_document: {
    kind: 'extract_document',
    builtInTools: ['Read'],
    mcpTools: ['save_extraction'],
    maxTurns: 8,
    timeoutMs: 5 * 60_000,
    modelRole: 'routine',
    handler: { prepare: prepareExtractDocument, onFailed: failExtractDocument },
  },
  portfolio_watch: {
    kind: 'portfolio_watch',
    builtInTools: [],
    mcpTools: ['watch_facts', 'create_item'],
    maxTurns: 6,
    timeoutMs: 3 * 60_000,
    modelRole: 'routine',
    schedule: { daily: '06:40' },
    handler: { prepare: preparePortfolioWatch },
  },
  morning_brief: {
    kind: 'morning_brief',
    builtInTools: [],
    mcpTools: ['watch_facts', 'recent_items', 'create_brief'],
    maxTurns: 6,
    timeoutMs: 3 * 60_000,
    modelRole: 'routine',
    schedule: { daily: '07:00' },
    waitsFor: ['research_scan', 'portfolio_watch'],
    handler: { prepare: prepareMorningBrief },
  },
} as const satisfies Record<string, JobSpec>;

/** The daily jobs, in the shape `planDailyJobs` reads. */
export const DAILY_JOBS: readonly DailyJob[] = Object.values(JOBS as Record<string, JobSpec>).flatMap((spec) => (spec.schedule === undefined ? [] : [{ kind: spec.kind, daily: spec.schedule.daily }]));

export function jobSpec(kind: string): JobSpec | undefined {
  return Object.hasOwn(JOBS, kind) ? JOBS[kind as keyof typeof JOBS] : undefined;
}
