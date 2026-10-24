import { businessDate, parseInstant } from '@esta/core';
import { MAX_MARKET_LINES, type MarketLine } from '@esta/core/agent-schemas';
import type { IsoDate } from '@esta/core/date';
import { formatDate, type Locale } from '@esta/core/format';
import { morningBriefPrompt } from '../prompts/morning-brief';
import { briefWriter, type BriefBinding } from '../tools/create-brief';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { daysAgo, recentItemsTool } from '../tools/recent-items';
import { estaTool } from '../tools/server';
import { readWatch, watchFactsTool, type WatchRead } from '../tools/watch-facts';
import type { JobContext, PreparedJob } from './registry';

type InputLines = Readonly<Record<string, Readonly<Record<Locale, string>>>>;

const WAITING_INPUT: InputLines = {
  portfolio_watch: { vi: 'Ghi chú theo dõi sáng nay chưa xong.', en: "This morning's watch notes are not done yet." },
  research_scan: { vi: 'Tin thị trường hôm nay chưa có.', en: "Today's market news is not in yet." },
};

const FAILED_INPUT: InputLines = {
  portfolio_watch: { vi: 'Ghi chú theo dõi sáng nay không chạy được.', en: "This morning's watch notes could not run." },
  research_scan: { vi: 'Hôm nay Trợ lý không tìm được tin thị trường.', en: "The assistant could not look for market news today." },
};

/** AGENT.md §5.4: research items of relevance 0.6 or more are eligible for the brief, three at most. */
const MARKET_RELEVANCE = 0.6;

export type BriefRequestInput = Omit<BriefBinding, 'sheet' | 'facts' | 'missingInputs' | 'market'> & {
  readonly timezone: string;
  /** The kinds still queued or running when the brief stopped waiting for them. */
  readonly waiting: readonly string[];
  /** The kinds that failed today with no attempt left. */
  readonly failed: readonly string[];
  read(): Promise<WatchRead>;
};

/** The morning_brief request, built here for the worker and the golden test alike, so a recording hashes the prompt the worker ships. */
export function morningBriefRequest(input: BriefRequestInput): PreparedJob {
  const { sheet, cite } = runSheet();
  const watch = watchFactsTool(input.read, input.locale, cite);
  const line = (lines: InputLines) => (kind: string) => lines[kind]?.[input.locale] ?? kind;
  const missingInputs = [...input.waiting.map(line(WAITING_INPUT)), ...input.failed.map(line(FAILED_INPUT))];
  const brief = briefWriter({ ...input, sheet, facts: watch.facts, missingInputs, market: () => todaysMarket(input) });
  return {
    prompt: morningBriefPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone }),
    tools: new Map([estaTool('watch_facts', watch.run), estaTool('recent_items', recentItemsTool(input, cite)), estaTool('create_brief', brief.write)]),
    async finish() {
      if (!watch.wasRead()) throw new Error('The model ended without reading watch_facts');
      const saved = brief.saved();
      if (saved === null) throw new Error('The model ended without saving the brief');
      return { as_of: input.asOf, facts: watch.facts.size, missing_inputs: [...input.waiting, ...input.failed], brief: saved };
    },
  };
}

async function todaysMarket({ db, householdId, asOf, timezone, locale, clock }: BriefRequestInput): Promise<MarketLine[]> {
  const { data, error } = await db
    .from('research_items')
    .select('title_vi, source_name, source_url, published_on, created_at')
    .eq('household_id', householdId)
    .gte('relevance', MARKET_RELEVANCE)
    .gte('created_at', await daysAgo(clock, 1))
    .order('relevance', { ascending: false })
    .order('created_at', { ascending: false })
    .order('url_normalized')
    .limit(20);
  if (error) throw new Error(`Reading today's research items failed: ${error.message}`);
  return data
    .filter((row) => businessDate(parseInstant(row.created_at), timezone) === asOf)
    .slice(0, MAX_MARKET_LINES)
    .map((row) => ({ text: row.title_vi, source: { name: row.source_name, date: formatDate(row.published_on as IsoDate, locale), url: row.source_url } }));
}

export async function prepareMorningBrief({ db, job, clock, timezone, waiting, failed }: JobContext): Promise<PreparedJob> {
  const asOf = (await clock()).today();
  const locale = await householdLocale(db, job.household_id);
  return morningBriefRequest({ db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, clock, waiting, failed, read: readWatch(db, job.household_id, asOf, timezone) });
}
