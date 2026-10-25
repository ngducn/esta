import type { Clock } from '@esta/core';
import { MAX_WEEKLY_PROPOSALS, weeklyNoteSchema } from '@esta/core/agent-schemas';
import { isoWeek } from '@esta/core/date/calendar';
import type { IsoDate } from '@esta/core/date';
import type { FilledNote } from '@esta/core/guard';
import type { Locale } from '@esta/core/format';
import { weeklyReviewPrompt, type ReviewCaps } from '../prompts/weekly-review';
import type { AgentDb } from '../supabase';
import { askReads, type AskReads } from '../tools/ask-reads';
import { guardedWriter, type GuardBinding } from '../tools/create-item';
import { proposalWriter } from '../tools/create-proposal';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { readTools } from '../tools/read-tools';
import { recentItemsTool } from '../tools/recent-items';
import { estaTool, ToolRejection } from '../tools/server';
import { resolveLinks } from './askStream';
import type { JobContext, PreparedJob } from './registry';
import { fetchedPage } from './research-scan';

/** [app rule] A smaller web budget than the morning scan's, since the review mostly reads the household's own figures. */
const CAPS: ReviewCaps = { WebSearch: 6, WebFetch: 4 };

const UNRESOLVED_LINK = /\]\((f\d+)\)/g;

export type WeeklyRequestInput = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly timezone: string;
  readonly reads: AskReads;
  clock(): Promise<Clock>;
};

/** What the job result keeps of the note for audit: the model's templates and the values that filled them (AGENT.md §6.3). */
export type WrittenReview = { readonly dedupe_key: string; readonly title: string; readonly body_md: string; readonly cited: Array<FilledNote['cited'][number]>; readonly links: string[]; readonly added: boolean };

const rejected = (lines: readonly string[]) => new ToolRejection(`${lines.join('\n')}\nFix these and call create_item again.`);

/**
 * `create_item` for weekly_review: one note a week, under the ISO week's key, so a retry in the same week adds nothing.
 * The body's `](fN)` links become the records' own links before the number guard reads it as Markdown with tables.
 */
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

  return { write, saved: () => saved };
}

/** The weekly_review request, built here for the worker and the golden test alike, so a recording hashes the prompt the worker ships. */
export function weeklyReviewRequest(input: WeeklyRequestInput): PreparedJob {
  const { db, householdId, locale, asOf, reads } = input;
  const { sheet, cite } = runSheet();
  const fetched = new Set<string>();
  const note = weeklyNoteWriter({ ...input, sheet, week: isoWeek(asOf) });
  const proposals = proposalWriter({ ...input, sheet, citing: { fetched, most: MAX_WEEKLY_PROPOSALS } });
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
      return { iso_week: isoWeek(asOf), note: saved, proposals: [...proposals.saved] };
    },
  };
}

export async function prepareWeeklyReview({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const asOf = (await clock()).today();
  const locale = await householdLocale(db, job.household_id);
  return weeklyReviewRequest({ db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, clock, reads: askReads(db, job.household_id, { locale, asOf }) });
}
