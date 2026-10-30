import 'server-only';
import { businessDate, isIsoDate, parseInstant, type Instant, type IsoDate } from '@esta/core';
import { RESEARCH_KINDS, type ResearchKind } from '@esta/core/agent-schemas';
import { failedJobKey, OPEN_NOTE_STATUSES } from '@esta/core/assistant';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type MarketItem = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly why: string;
  readonly kind: ResearchKind;
  readonly publishedOn: IsoDate;
  readonly effectiveOn: IsoDate | null;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly relatedPropertyIds: readonly string[];
  readonly provinceCodes: readonly string[];
};

export type MarketProperty = { readonly id: string; readonly nickname: string; readonly provinceCode: string | null };

export type Market = {
  readonly items: readonly MarketItem[];
  readonly properties: readonly MarketProperty[];
  readonly topics: readonly string[];
  /** Today's line about the news scan: its open Thử lại item when it failed, else its note that it kept nothing (#329). */
  readonly scanToday: { readonly failed: boolean; readonly title: string } | null;
};

const kind = z.enum(RESEARCH_KINDS);
const address = z.object({ province_code: z.string() });
const date = (text: string | null): IsoDate | null => (text !== null && isIsoDate(text) ? text : null);
const TOPIC_ORDER = ['province:', 'commune:', 'national:'];

/** The Thị trường tab: the household's research items newest first, its properties for the filter, and its active topics (DESIGN-BRIEF §6.11). */
export async function loadMarket(householdId: string, now: Instant, timezone: string): Promise<Market> {
  const supabase = await createSessionClient();
  const latest = (kind: 'alert' | 'research_scan_empty') =>
    supabase.from('agent_items').select('title, created_at').eq('household_id', householdId).eq('kind', kind).lte('created_at', now).order('created_at', { ascending: false }).limit(1);
  const today = businessDate(now, timezone);
  const [items, properties, topics, failed, empty] = await Promise.all([
    supabase
      .from('research_items')
      .select('id, title_vi, summary_vi, why_it_matters_vi, kind, published_on, effective_on, source_name, source_url, related_property_ids, province_codes')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .order('relevance', { ascending: false })
      .order('id')
      .limit(100),
    supabase.from('properties').select('id, nickname, current_address').eq('household_id', householdId).is('deleted_at', null).order('code'),
    supabase.from('research_topics').select('topic_key, label').eq('household_id', householdId).eq('active', true).order('label'),
    latest('alert').like('dedupe_key', failedJobKey('research_scan', today, '%')).in('status', OPEN_NOTE_STATUSES).maybeSingle(),
    latest('research_scan_empty').maybeSingle(),
  ]);
  for (const { error } of [items, properties, topics, failed, empty]) if (error) throw new Error(`Reading the market news failed: ${error.message}`);
  const quietToday = empty.data !== null && businessDate(parseInstant(empty.data.created_at), timezone) === today ? { failed: false, title: empty.data.title } : null;
  return {
    items: (items.data ?? []).flatMap((row) => {
      const publishedOn = date(row.published_on);
      return publishedOn === null
        ? []
        : [
            {
              id: row.id,
              title: row.title_vi,
              summary: row.summary_vi,
              why: row.why_it_matters_vi,
              kind: kind.catch('other').parse(row.kind),
              publishedOn,
              effectiveOn: date(row.effective_on),
              sourceName: row.source_name,
              sourceUrl: row.source_url,
              relatedPropertyIds: row.related_property_ids,
              provinceCodes: row.province_codes,
            },
          ];
    }),
    properties: (properties.data ?? []).map((row) => ({ id: row.id, nickname: row.nickname, provinceCode: address.safeParse(row.current_address).data?.province_code ?? null })),
    topics: (topics.data ?? [])
      .toSorted((a, b) => TOPIC_ORDER.findIndex((prefix) => a.topic_key.startsWith(prefix)) - TOPIC_ORDER.findIndex((prefix) => b.topic_key.startsWith(prefix)))
      .map((row) => row.label),
    scanToday: failed.data !== null ? { failed: true, title: failed.data.title } : quietToday,
  };
}
