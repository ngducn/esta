import type { Clock } from '@esta/core';
import { firstRunKey, scheduledWeek } from '@esta/core/agent-schedule';
import { MAX_WEEKLY_PROPOSALS, weeklyNoteSchema } from '@esta/core/agent-schemas';
import { isoWeek, isoWeekSunday } from '@esta/core/date/calendar';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { weeklyReviewPrompt, type ReviewCaps } from '../prompts/weekly-review';
import type { AgentDb } from '../supabase';
import { askReads, type AskReads } from '../tools/ask-reads';
import { guardedWriter, type GuardBinding, type WrittenNote } from '../tools/create-item';
import { proposalWriter } from '../tools/create-proposal';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { readTools } from '../tools/read-tools';
import { recentItemsTool } from '../tools/recent-items';
import { estaTool, oneAtATime, ToolRejection } from '../tools/server';
import { resolveLinks } from './askStream';
import type { AgentJob, JobContext, PreparedJob } from './registry';
import { fetchedPage } from './research-scan';

const CAPS: ReviewCaps = { WebSearch: 6, WebFetch: 4 };

const UNRESOLVED_LINK = /\]\((f\d+)\)/g;

export type WeeklyRequestInput = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly locale: Locale;
  readonly timezone: string;
  readonly reads: AskReads;
  /** The proposals earlier attempts and retries of this week's run stored, which count against its cap. */
  readonly earlierProposals: number;
  clock(): Promise<Clock>;
} & ReviewedWeek;

/** The ISO week a run reviews, and the date its figures stand at: that week's Sunday, or today while the week runs. */
export type ReviewedWeek = { readonly week: string; readonly asOf: IsoDate };

/**
 * The week comes from the job's key, so a Thử lại that runs after midnight still writes the week it retries and the
 * next Sunday's run keeps its own. A job the scheduler did not key reviews this week.
 */
export function reviewedWeek(job: Pick<AgentJob, 'idempotency_key'>, today: IsoDate): ReviewedWeek {
  const week = scheduledWeek(job.idempotency_key) ?? isoWeek(today);
  const sunday = isoWeekSunday(week);
  return { week, asOf: sunday < today ? sunday : today };
}

type WrittenReview = WrittenNote & { readonly links: string[] };

const rejected = (lines: readonly string[]) => new ToolRejection(`${lines.join('\n')}\nFix these and call create_item again.`);

function weeklyNoteWriter(binding: GuardBinding & { readonly week: string }) {
  const guard = guardedWriter(binding, 'create_item');
  let saved: WrittenReview | null = null;

  async function write(raw: Record<string, unknown>): Promise<{ saved: true }> {
    if (saved !== null) throw new ToolRejection('This run already saved the weekly note.');
    const parsed = weeklyNoteSchema.safeParse(raw);
    if (!parsed.success) throw rejected(parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
    const note = parsed.data;
    const body = resolveLinks(note.body_md, binding.sheet);
    const unknown = [...new Set([...note.related, ...[...body.text.matchAll(UNRESOLVED_LINK)].map(([, handle]) => handle ?? '')])].filter((handle) => typeof binding.sheet.get(handle)?.link !== 'string');
    if (unknown.length > 0) throw rejected([`${unknown.join(', ')}: not a record with a link that a tool returned in this run. Relate and link only those.`]);

    const [title, filled] = await guard.fill(
      [
        { template: note.title, format: 'plain' },
        { template: note.body_md, format: 'markdown-tables', linked: body.text },
      ],
      `${note.title}\n\n${note.body_md}`,
    );
    const links = [...new Set([...note.related.map((handle) => String(binding.sheet.get(handle)?.link)), ...body.refs])];
    const dedupeKey = `weekly_review:${binding.week}`;
    const added = await guard.save({ kind: 'weekly', severity: 'info', title: title?.text ?? '', body_md: filled?.text ?? '', related: { links }, dedupe_key: dedupeKey });
    saved = { dedupe_key: dedupeKey, title: note.title, body_md: note.body_md, cited: [...(title?.cited ?? []), ...(filled?.cited ?? [])], links, added };
    return { saved: true };
  }

  return { write: oneAtATime(write), saved: () => saved };
}

export function weeklyReviewRequest(input: WeeklyRequestInput): PreparedJob {
  const { db, householdId, locale, asOf, week, reads } = input;
  const { sheet, cite } = runSheet();
  const fetched = new Set<string>();
  const note = weeklyNoteWriter({ ...input, sheet });
  const proposals = proposalWriter({ ...input, sheet, citing: { fetched }, cap: { max: MAX_WEEKLY_PROPOSALS, earlier: input.earlierProposals } });
  return {
    prompt: weeklyReviewPrompt({ locale, today: asOf, timezone: input.timezone, caps: CAPS, proposals: MAX_WEEKLY_PROPOSALS }),
    tools: new Map([
      ...readTools(db, householdId, { reads, locale, asOf, cite }),
      estaTool('recent_items', recentItemsTool(input, cite, { days: 30, minRelevance: 0, limit: 20 })),
      estaTool('create_item', note.write),
      estaTool('create_proposal', proposals.write),
    ]),
    caps: { ...CAPS },
    observe(call) {
      for (const url of fetchedPage(call)?.urls ?? []) fetched.add(url);
    },
    async finish() {
      const saved = note.saved();
      if (saved === null) throw new Error('The model ended without saving the weekly note');
      return { iso_week: week, note: saved, proposals: [...proposals.saved] };
    },
  };
}

/** Every attempt of this week's run, the first job and each Thử lại, so retrying cannot make more proposals than one run may. */
export async function weekProposals(db: AgentDb, job: Pick<AgentJob, 'id' | 'household_id' | 'kind' | 'idempotency_key'>): Promise<number> {
  let runs = [job.id];
  if (job.idempotency_key !== null) {
    const first = firstRunKey(job.idempotency_key);
    const { data, error } = await db
      .from('agent_jobs')
      .select('id, idempotency_key')
      .eq('household_id', job.household_id)
      .eq('kind', job.kind)
      .like('idempotency_key', `${first.replace(/[\\%_]/g, '\\$&')}%`);
    if (error) throw new Error(`Reading this week's review jobs failed: ${error.message}`);
    runs = [...new Set([...runs, ...data.filter((run) => run.idempotency_key !== null && firstRunKey(run.idempotency_key) === first).map(({ id }) => id)])];
  }
  const { count, error } = await db.from('agent_items').select('id', { count: 'exact', head: true }).eq('household_id', job.household_id).eq('kind', 'proposal').in('job_id', runs);
  if (error) throw new Error(`Counting this week's proposals failed: ${error.message}`);
  return count ?? 0;
}

export async function prepareWeeklyReview({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const { week, asOf } = reviewedWeek(job, (await clock()).today());
  const [locale, earlierProposals] = await Promise.all([householdLocale(db, job.household_id), weekProposals(db, job)]);
  return weeklyReviewRequest({ db, householdId: job.household_id, jobId: job.id, locale, week, asOf, timezone, clock, earlierProposals, reads: askReads(db, job.household_id, { locale, asOf }) });
}
