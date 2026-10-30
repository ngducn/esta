import { businessDate, parseInstant } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { normalizeUrl, sourceLink } from '@esta/core/research';
import { z } from 'zod';
import { researchScanPrompt, type ScanCaps } from '../prompts/research-scan';
import type { BuiltInResult } from '../sdk/session';
import type { AgentDb } from '../supabase';
import { researchItemWriter, type FetchedPage, type ResearchBinding } from '../tools/add-research-item';
import { guardedWriter } from '../tools/create-item';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { listPropertiesTool } from '../tools/list-properties';
import { recentItemsTool } from '../tools/recent-items';
import { researchTopicsTool, syncResearchTopics } from '../tools/research-topics';
import { estaTool } from '../tools/server';
import type { JobContext, PreparedJob } from './registry';

const EMPTY_NOTE: Readonly<Record<Locale, string>> = {
  vi: 'Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.',
  en: "There is no notable news for the family's areas today.",
};

/** AGENT.md §5.2 maximums, which `household_settings.agent` may lower; maxTurns 40 is sized for them. */
const capsSchema = z.object({ research_searches: z.int().min(0).max(12).catch(12), research_fetches: z.int().min(0).max(8).catch(8) });

const fetchResult = z.object({ code: z.number(), result: z.string(), url: z.string().optional() });

/**
 * A WebFetch call that read its page: the page text, under its link as asked and as it ended after any redirect,
 * normalized, and the link it ended on as `research_items.source_url` stores it.
 */
export function fetchedPage({ name, input, result }: BuiltInResult): (FetchedPage & { readonly urls: readonly string[] }) | null {
  const page = fetchResult.safeParse(result);
  if (name !== 'WebFetch' || !page.success || page.data.code < 200 || page.data.code > 299) return null;
  const links = [page.data.url, input.url].flatMap((link) => (typeof link === 'string' ? [link] : []));
  const urls = links.flatMap((link) => {
    const url = normalizeUrl(link);
    return url.ok ? [url.value] : [];
  });
  const read = links.map(sourceLink).find((link) => link.ok);
  return read?.ok === true ? { urls, text: page.data.result, link: read.value } : null;
}

export type ScanRequestInput = Omit<ResearchBinding, 'sheet' | 'topics' | 'properties' | 'fetched'> & { readonly timezone: string; readonly caps: ScanCaps };

export function researchScanRequest(input: ScanRequestInput): PreparedJob {
  const { sheet, cite } = runSheet();
  const topics = researchTopicsTool(input.db, input.householdId, cite);
  const properties = listPropertiesTool(input.db, input.householdId, cite);
  const fetched = new Map<string, FetchedPage>();
  const items = researchItemWriter({ ...input, sheet, topics: topics.records, properties: properties.records, fetched });
  return {
    prompt: researchScanPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone, caps: input.caps }),
    tools: new Map([
      estaTool('research_topics', topics.run),
      estaTool('list_properties', properties.run),
      estaTool('recent_items', recentItemsTool(input, cite, { days: 30, minRelevance: 0, limit: 50 })),
      estaTool('add_research_item', items.write),
    ]),
    caps: { ...input.caps },
    observe(call) {
      const page = fetchedPage(call);
      if (page !== null) for (const url of page.urls) fetched.set(url, { text: page.text, link: page.link });
    },
    async finish() {
      if (!topics.wasRead()) throw new Error('The model ended without reading research_topics');
      const empty = items.kept.length === 0 && !(await storedToday(input));
      if (empty) {
        await guardedWriter({ ...input, sheet }, 'research_scan').save({ kind: 'research_scan_empty', severity: 'info', title: EMPTY_NOTE[input.locale], body_md: null, related: {}, dedupe_key: `research_scan_empty:${input.asOf}` });
      }
      return { as_of: input.asOf, kept: items.kept.map(({ id, url_normalized, relevance, cited }) => ({ id, url_normalized, relevance, cited })), dropped: [...items.dropped], fetched: fetched.size, empty };
    },
  };
}

async function storedToday({ db, householdId, asOf, timezone }: ScanRequestInput): Promise<boolean> {
  const { data, error } = await db.from('research_items').select('created_at').eq('household_id', householdId).order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Reading today's research items failed: ${error.message}`);
  const latest = data[0]?.created_at;
  return typeof latest === 'string' && businessDate(parseInstant(latest), timezone) === asOf;
}

async function scanCaps(db: AgentDb, householdId: string): Promise<ScanCaps> {
  const { data, error } = await db.from('household_settings').select('agent').eq('household_id', householdId).maybeSingle();
  if (error) throw new Error(`Reading the household settings failed: ${error.message}`);
  const caps = capsSchema.safeParse(data?.agent ?? {});
  const { research_searches, research_fetches } = caps.success ? caps.data : capsSchema.parse({});
  return { WebSearch: research_searches, WebFetch: research_fetches };
}

async function lastSuccessOn(db: AgentDb, householdId: string, timezone: string): Promise<IsoDate | null> {
  const { data, error } = await db.from('agent_jobs').select('finished_at').eq('household_id', householdId).eq('kind', 'research_scan').eq('status', 'done').order('finished_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Reading the last research scan failed: ${error.message}`);
  const finished = data[0]?.finished_at;
  return typeof finished === 'string' ? businessDate(parseInstant(finished), timezone) : null;
}

export async function prepareResearchScan({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const asOf = (await clock()).today();
  const [locale, caps, since] = await Promise.all([householdLocale(db, job.household_id), scanCaps(db, job.household_id), lastSuccessOn(db, job.household_id, timezone), syncResearchTopics(db, job.household_id)]);
  return researchScanRequest({ db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, clock, caps, lastSuccessOn: since });
}
