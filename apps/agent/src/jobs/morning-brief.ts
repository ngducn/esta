import type { Locale } from '@esta/core/format';
import { morningBriefPrompt } from '../prompts/morning-brief';
import { briefWriter, type BriefBinding } from '../tools/create-brief';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { recentItemsTool } from '../tools/recent-items';
import { estaTool } from '../tools/server';
import { readWatch, watchFactsTool, type WatchRead } from '../tools/watch-facts';
import type { JobContext, PreparedJob } from './registry';

/** The brief's line for an input it waited for and went without (AGENT.md §3). */
const MISSING_INPUT: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  portfolio_watch: { vi: 'Ghi chú theo dõi sáng nay chưa xong.', en: "This morning's watch notes are not done yet." },
  research_scan: { vi: 'Tin thị trường hôm nay chưa có.', en: "Today's market news is not in yet." },
};

export type BriefRequestInput = Omit<BriefBinding, 'sheet' | 'facts' | 'missingInputs'> & {
  readonly timezone: string;
  /** The kinds still queued or running when the brief stopped waiting for them. */
  readonly waiting: readonly string[];
  read(): Promise<WatchRead>;
};

/** The morning_brief request, built here for the worker and the golden test alike, so a recording hashes the prompt the worker ships. */
export function morningBriefRequest(input: BriefRequestInput): PreparedJob {
  const { sheet, cite } = runSheet();
  const watch = watchFactsTool(input.read, input.locale, cite);
  const missingInputs = input.waiting.map((kind) => MISSING_INPUT[kind]?.[input.locale] ?? kind);
  const brief = briefWriter({ ...input, sheet, facts: watch.facts, missingInputs });
  return {
    prompt: morningBriefPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone }),
    tools: new Map([estaTool('watch_facts', watch.run), estaTool('recent_items', recentItemsTool(input, cite)), estaTool('create_brief', brief.write)]),
    async finish() {
      if (!watch.wasRead()) throw new Error('The model ended without reading watch_facts');
      const saved = brief.saved();
      if (saved === null) throw new Error('The model ended without saving the brief');
      return { as_of: input.asOf, facts: watch.facts.size, missing_inputs: [...input.waiting], brief: saved };
    },
  };
}

export async function prepareMorningBrief({ db, job, clock, timezone, waiting }: JobContext): Promise<PreparedJob> {
  const asOf = (await clock()).today();
  const locale = await householdLocale(db, job.household_id);
  return morningBriefRequest({ db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, clock, waiting, read: readWatch(db, job.household_id, asOf, timezone) });
}
