import type { Clock } from '@esta/core';
import { MAX_SUMMARY_TOKENS, researchItemDraftSchema, wordCount, type ResearchItemDraft } from '@esta/core/agent-schemas';
import type { IsoDate } from '@esta/core/date';
import { formatDate, type Locale } from '@esta/core/format';
import type { FactSheet, FilledNote } from '@esta/core/guard';
import { keepRule, normalizeUrl, type DropReason } from '@esta/core/research';
import type { AgentDb } from '../supabase';
import { guardedWriter } from './create-item';
import { daysAgo } from './recent-items';
import { ToolRejection } from './server';

export type ResearchBinding = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly lastSuccessOn: IsoDate | null;
  /** The run's sheet; each call adds `f0`, the item's own source, on a copy. */
  readonly sheet: FactSheet;
  readonly topics: ReadonlyMap<string, { readonly province_codes: readonly string[] }>;
  readonly properties: ReadonlyMap<string, { readonly id: string }>;
  /** The text WebFetch returned in this run for each page it read, by normalized link. */
  readonly fetched: ReadonlyMap<string, string>;
  clock(): Promise<Clock>;
};

export type Dropped = { readonly source_url: string; readonly reason: DropReason | 'not_fetched' | 'duplicate_url' | 'similar_title' };
export type Kept = { readonly id: string; readonly url_normalized: string; readonly title: string; readonly relevance: number; readonly cited: Array<FilledNote['cited'][number]> };

const SIMILAR_TITLE = 0.6;
const DEDUPE_DAYS = 30;

const DROPPED_HINT: Readonly<Record<Dropped['reason'], string>> = {
  not_fetched: 'WebFetch did not read this page in this run, so it cannot be cited. Move on.',
  seen_before: 'It was published before the last scan and is no rule taking effect soon. Move on.',
  published_in_future: 'Its publication date is after today. Move on.',
  duplicate_url: 'This page is already stored. Move on.',
  similar_title: 'A stored item of the last 30 days has nearly the same title. Move on.',
};

const squash = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

function handlesIn(list: readonly string[], known: ReadonlyMap<string, unknown>, tool: string): void {
  const unknown = list.filter((handle) => !known.has(handle));
  if (unknown.length > 0) throw new ToolRejection(`${unknown.join(', ')}: not a ${tool} record of this run. Use only the handles ${tool} returned.`);
}

/** `f0` for one item: its publication date and the phrases copied from its page, which the page must hold word for word. */
function sourceRecord(draft: ResearchItemDraft, page: string, locale: Locale): Record<string, string> {
  const text = squash(page);
  const missing = draft.quotes.filter((quote) => !text.includes(squash(quote)));
  if (missing.length > 0) throw new ToolRejection(`${missing.map((quote) => JSON.stringify(quote)).join(', ')}: not on the page WebFetch returned. Copy each quote exactly, or leave it out.`);
  return Object.fromEntries([['published_display', formatDate(draft.published_on, locale)], ...draft.quotes.map((quote, i) => [`quote_${i + 1}_label`, squash(quote)])]);
}

/**
 * `add_research_item` for research_scan (AGENT.md §5.2). It keeps an item only from a page fetched in this run, new
 * under the keep rule, and not a stored link or title of the last 30 days; the texts pass the number guard with the
 * item's own repair turn, and the summary holds at most 60 words as it reads.
 */
export function researchItemWriter(binding: ResearchBinding) {
  const guards = new Map<string, { readonly sheet: Map<string, Readonly<Record<string, unknown>>>; readonly guard: ReturnType<typeof guardedWriter> }>();
  const kept: Kept[] = [];
  const dropped: Dropped[] = [];

  const guardFor = (url: string) => {
    let entry = guards.get(url);
    if (entry === undefined) {
      const sheet = new Map<string, Readonly<Record<string, unknown>>>();
      entry = { sheet, guard: guardedWriter({ ...binding, sheet }, 'add_research_item') };
      guards.set(url, entry);
    }
    return entry;
  };

  const drop = (source_url: string, reason: Dropped['reason']) => {
    dropped.push({ source_url, reason });
    return { saved: false, dropped: reason, hint: DROPPED_HINT[reason] };
  };

  async function write(raw: Record<string, unknown>): Promise<unknown> {
    const parsed = researchItemDraftSchema.safeParse(raw);
    if (!parsed.success) throw new ToolRejection(`The item does not match add_research_item:\n${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`);
    const draft = parsed.data;
    const url = normalizeUrl(draft.source_url);
    if (!url.ok) throw new ToolRejection(`source_url: ${url.reason === 'not_https' ? 'cite an https page' : 'not a link'}.`);
    const page = binding.fetched.get(url.value);
    if (page === undefined) return drop(draft.source_url, 'not_fetched');
    const keep = keepRule({ publishedOn: draft.published_on, effectiveOn: draft.effective_on }, { today: binding.asOf, lastSuccessOn: binding.lastSuccessOn });
    if (!keep.ok) return drop(draft.source_url, keep.reason);
    const stored = await binding.db.from('research_items').select('id').eq('household_id', binding.householdId).eq('url_normalized', url.value).maybeSingle();
    if (stored.error) throw new Error(`add_research_item failed: ${stored.error.message}`);
    if (stored.data !== null) return drop(draft.source_url, 'duplicate_url');
    handlesIn(draft.topics, binding.topics, 'research_topics');
    handlesIn(draft.properties, binding.properties, 'list_properties');

    const { sheet, guard } = guardFor(url.value);
    sheet.clear();
    for (const [handle, record] of binding.sheet) sheet.set(handle, record);
    sheet.set('f0', sourceRecord(draft, page, binding.locale));
    const [title, summary, why] = await guard.fill(
      [draft.title_vi, draft.summary_vi, draft.why_it_matters_vi].map((template) => ({ template, format: 'plain' as const })),
      JSON.stringify(draft, null, 2),
    );
    const words = wordCount(summary?.text ?? '');
    if (words > MAX_SUMMARY_TOKENS) throw new ToolRejection(`summary_vi reads ${words} words; keep it to ${MAX_SUMMARY_TOKENS} and call add_research_item again.`);

    const since = await daysAgo(binding.clock, DEDUPE_DAYS);
    const similar = await binding.db.rpc('research_title_similar', { p_household_id: binding.householdId, p_title: title?.text ?? '', p_since: since });
    if (similar.error) throw new Error(`add_research_item failed: ${similar.error.message}`);
    if (similar.data > SIMILAR_TITLE) return drop(draft.source_url, 'similar_title');

    const { data, error } = await binding.db
      .from('research_items')
      .upsert(
        {
          household_id: binding.householdId,
          url_normalized: url.value,
          source_url: draft.source_url,
          source_name: draft.source_name,
          published_on: draft.published_on,
          effective_on: draft.effective_on,
          title_vi: title?.text ?? '',
          summary_vi: summary?.text ?? '',
          why_it_matters_vi: why?.text ?? '',
          kind: draft.kind,
          relevance: draft.relevance,
          related_property_ids: [...new Set(draft.properties.flatMap((handle) => binding.properties.get(handle)?.id ?? []))],
          province_codes: [...new Set(draft.topics.flatMap((handle) => binding.topics.get(handle)?.province_codes ?? []))],
          job_id: binding.jobId,
          created_at: (await binding.clock()).now(),
        },
        { onConflict: 'household_id,url_normalized', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`add_research_item failed: ${error.message}`);
    const [row] = data;
    if (row === undefined) return drop(draft.source_url, 'duplicate_url');
    kept.push({ id: row.id, url_normalized: url.value, title: title?.text ?? '', relevance: draft.relevance, cited: [title, summary, why].flatMap((note) => note?.cited ?? []) });
    return { saved: true };
  }

  return { write, kept: kept as readonly Kept[], dropped: dropped as readonly Dropped[] };
}
