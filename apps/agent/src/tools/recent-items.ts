import { businessDate, parseInstant, type Clock } from '@esta/core';
import { formatDate, type Locale } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';

const KINDS = ['alert', 'research_scan_empty'];

export type ResearchWindow = { readonly days: number; readonly minRelevance: number; readonly limit: number };

export type ResearchRecord = { readonly title_label: string; readonly source_name: string; readonly source_url: string; readonly published_display: string };

type Binding = { readonly db: AgentDb; readonly householdId: string; readonly asOf: IsoDate; readonly timezone: string; readonly locale: Locale; clock(): Promise<Clock> };

const DAY_MS = 86_400_000;

export async function daysAgo(clock: () => Promise<Clock>, days: number): Promise<string> {
  return new Date(Date.parse((await clock()).now()) - days * DAY_MS).toISOString();
}

async function todaysNotes({ db, householdId, asOf, timezone }: Binding, cite: RunSheet['cite']) {
  const { data, error } = await db
    .from('agent_items')
    .select('kind, severity, title, created_at')
    .eq('household_id', householdId)
    .eq('audience', 'all')
    .in('kind', KINDS)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`recent_items failed: ${error.message}`);
  return data.filter((row) => businessDate(parseInstant(row.created_at), timezone) === asOf).map((row) => cite({ kind: row.kind, severity: row.severity, title_label: row.title }));
}

async function recentResearch({ db, householdId, locale, clock }: Binding, window: ResearchWindow, cite: RunSheet['cite']) {
  const { data, error } = await db
    .from('research_items')
    .select('title_vi, source_name, source_url, published_on')
    .eq('household_id', householdId)
    .gte('created_at', await daysAgo(clock, window.days))
    .gte('relevance', window.minRelevance)
    .order('created_at', { ascending: false })
    .limit(window.limit);
  if (error) throw new Error(`recent_items failed: ${error.message}`);
  return data.map((row): CitedRecord<ResearchRecord> => cite({ title_label: row.title_vi, source_name: row.source_name, source_url: row.source_url, published_display: formatDate(row.published_on as IsoDate, locale) }));
}

/**
 * `recent_items`: the notes Trợ lý already left the household today, and with a `research` window the research items
 * stored in it, each a citable record. A second call answers the same records.
 */
export function recentItemsTool(binding: Binding, cite: RunSheet['cite'], research?: ResearchWindow) {
  let answer: { items: unknown[]; research?: unknown[] } | undefined;
  return async () => {
    answer ??= { items: await todaysNotes(binding, cite), ...(research === undefined ? {} : { research: await recentResearch(binding, research, cite) }) };
    return answer;
  };
}
