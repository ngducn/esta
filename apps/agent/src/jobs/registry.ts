import type { Clock } from '@esta/core';
import type { ScheduledJob } from '@esta/core/agent-schedule';
import type { Json, Tables } from '@esta/db';
import type { Locale } from '@esta/core/format';
import type { AgentDb } from '../supabase';
import type { BuiltInResult } from '../sdk/session';
import type { EstaToolName, EstaTools } from '../tools/server';
import { failAsk, prepareAsk } from './ask';
import { failExtractDocument, prepareExtractDocument } from './extract-document';
import { preparePing } from './ping';
import { prepareMorningBrief } from './morning-brief';
import { preparePortfolioWatch } from './portfolio-watch';
import { prepareResearchScan } from './research-scan';
import { prepareWeeklyReview } from './weekly-review';

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
  /** The kinds in the spec's `waitsFor` that failed today with no attempt left. */
  readonly failed: readonly string[];
  /** The worker's clock, read when a row's time is written, so a frozen test clock dates it (FND-9). */
  clock(): Promise<Clock>;
};

export type PreparedJob = {
  readonly prompt: string;
  /** Exactly the kind's `mcpTools`, each bound to the job's household. */
  readonly tools: EstaTools;
  /** Checks the job's effects and returns `agent_jobs.result`; throws when the model did not do the task. */
  finish(run: FinishedRun): Promise<Json>;
  readonly caps?: Readonly<Record<string, number>>;
  observe?(call: BuiltInResult): void;
  onText?(delta: string): Promise<void>;
  nextTurn?(): Promise<string | null>;
  /** The earlier turn this job continues, as a follow-up question does (AGENT.md §8). */
  readonly resume?: { readonly sessionId: string | null; readonly afterInputHash: string };
  rebuild?(): Promise<string | null>;
  /** Another model than the kind's, as an operator's Suy nghĩ kỹ hơn asks. */
  readonly modelRole?: ModelRole;
};

/** The session the job's last turn ran in, and that turn's replay key, for a job a later one resumes. */
export type FinishedRun = { readonly reply: string; readonly model: string; readonly sessionId?: string | null; readonly turnHash?: string };

export type JobSpec = {
  readonly kind: string;
  /** Claude Code built-in tools the SDK may offer; `[]` offers none (S1 correction 2). */
  readonly builtInTools: readonly string[];
  readonly mcpTools: readonly EstaToolName[];
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly modelRole: ModelRole;
  readonly schedule?: Omit<ScheduledJob, 'kind'>;
  readonly workDir?: 'conversation';
  /** Daily kinds whose same-day job must finish first; the runner reschedules the job while one is queued or running (AGENT.md §3). */
  readonly waitsFor?: readonly string[];
  /** The title of the item with Thử lại that admins get once the job has no attempt left (AGENT.md §9). */
  readonly failedTitle?: Readonly<Record<Locale, string>>;
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
  research_scan: {
    kind: 'research_scan',
    builtInTools: ['WebSearch', 'WebFetch'],
    mcpTools: ['research_topics', 'list_properties', 'recent_items', 'add_research_item'],
    maxTurns: 40,
    timeoutMs: 10 * 60_000,
    modelRole: 'routine',
    schedule: { at: '06:00' },
    failedTitle: { vi: 'Trợ lý chưa đọc được tin thị trường hôm nay', en: "The assistant could not read today's market news" },
    handler: { prepare: prepareResearchScan },
  },
  portfolio_watch: {
    kind: 'portfolio_watch',
    builtInTools: [],
    mcpTools: ['watch_facts', 'create_item'],
    maxTurns: 8,
    timeoutMs: 3 * 60_000,
    modelRole: 'routine',
    schedule: { at: '06:40' },
    failedTitle: { vi: 'Trợ lý chưa xem được danh mục hôm nay', en: 'The assistant could not check the portfolio today' },
    handler: { prepare: preparePortfolioWatch },
  },
  morning_brief: {
    kind: 'morning_brief',
    builtInTools: [],
    mcpTools: ['watch_facts', 'recent_items', 'create_brief'],
    maxTurns: 6,
    timeoutMs: 3 * 60_000,
    modelRole: 'routine',
    schedule: { at: '07:00' },
    waitsFor: ['research_scan', 'portfolio_watch'],
    failedTitle: { vi: 'Trợ lý chưa viết được bản tin sáng nay', en: "The assistant could not write this morning's brief" },
    handler: { prepare: prepareMorningBrief },
  },
  weekly_review: {
    kind: 'weekly_review',
    builtInTools: ['WebSearch', 'WebFetch'],
    mcpTools: ['list_properties', 'portfolio_overview', 'get_property', 'property_metrics', 'list_leases', 'collections', 'ledger', 'tax_position', 'payment_behavior', 'recent_items', 'create_item', 'create_proposal'],
    maxTurns: 25,
    timeoutMs: 10 * 60_000,
    modelRole: 'deep',
    schedule: { at: '08:00', weekday: 0 },
    failedTitle: { vi: 'Trợ lý chưa viết được bản tổng kết tuần này', en: "The assistant could not write this week's review" },
    handler: { prepare: prepareWeeklyReview },
  },
  ask: {
    kind: 'ask',
    builtInTools: [],
    mcpTools: ['list_properties', 'portfolio_overview', 'get_property', 'property_metrics', 'list_leases', 'collections', 'ledger', 'tax_position', 'payment_behavior', 'create_proposal'],
    maxTurns: 15,
    timeoutMs: 2 * 60_000,
    modelRole: 'routine',
    workDir: 'conversation',
    handler: { prepare: prepareAsk, onFailed: failAsk },
  },
} as const satisfies Record<string, JobSpec>;

export const SCHEDULED_JOBS: readonly ScheduledJob[] = Object.values(JOBS as Record<string, JobSpec>).flatMap((spec) => (spec.schedule === undefined ? [] : [{ kind: spec.kind, ...spec.schedule }]));

export function jobSpec(kind: string): JobSpec | undefined {
  return Object.hasOwn(JOBS, kind) ? JOBS[kind as keyof typeof JOBS] : undefined;
}
