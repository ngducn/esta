import { officialSourcesText, type ScanWindow } from '@esta/core/research';
import { PUBLISHED_LABEL } from '@esta/core/parse/page-dates';
import { systemPrompt } from './system';

export type ScanCaps = { readonly WebSearch: number; readonly WebFetch: number };

type ScanContext = Omit<Parameters<typeof systemPrompt>[0], 'today'> & { readonly caps: ScanCaps; readonly window: ScanWindow };

/**
 * Carries the dates, locale and caps but no id or name, so households seeded alike replay one recording (AGENT.md §8).
 * Today and the keep window come from one `ScanWindow`, the value `add_research_item` judges each article by.
 */
export function researchScanPrompt({ caps, window, ...context }: ScanContext): string {
  return [
    systemPrompt({ ...context, today: window.today }),
    '',
    "Task: the morning market scan. Find news that matters to the family's properties: land price tables, planning and zoning, infrastructure such as ring roads, metro lines, expressways, airports and bridges, the rental market for the kinds of property held, and the national rules on land, rental tax and mortgage rates.",
    `Keep only news published on or after ${window.newSince}, or news of a rule that takes effect from ${window.today} to ${window.effectiveBy}. Esta drops any other article, so reading one spends a fetch for nothing.`,
    '1. Call research_topics, list_properties and recent_items once each. recent_items lists the research items already stored; never add those again.',
    `2. Search with WebSearch using the topics' query_templates, Vietnamese first and English where useful. Ask for recent news: add the year ${window.today.slice(0, 4)} or words such as mới nhất to a query; it may hold no other number. Skip a result whose date is before ${window.newSince} without fetching it, unless it is about a rule that takes effect by ${window.effectiveBy}. This run may make ${caps.WebSearch} searches and ${caps.WebFetch} fetches; calls past that are refused.`,
    `3. Prefer official sources (${officialSourcesText()}) and established press. Never use forums or listing sites. Fetch single articles with WebFetch; do not crawl. In its prompt, ask for the article's own date line, the one by its headline or byline that says when it was posted and never the site header's date or clock, copied exactly as printed on one line that starts "${PUBLISHED_LABEL}:", and for every figure, road and law number copied word for word from the article.`,
    '4. For each fetched article that is in that window and material, call add_research_item once. title_vi, summary_vi and why_it_matters_vi are your own words in plain text on one line: summary_vi at most sixty words, why_it_matters_vi naming the properties or provinces it touches through their _label or _name placeholders. topics and properties are the handles the item concerns.',
    `5. The number rule holds for those three texts and for source_name, the outlet as plain text; when its name holds a digit, write {{f0.host_label}}. A figure, a road or a law number from the article, such as the name of a ring road, goes into quotes copied exactly from the page WebFetch returned, with the words around it, at least three words, and the text cites it as {{f0.quote_1_label}}; the publication date is {{f0.published_display}}. published_on is the date on that ${PUBLISHED_LABEL} line, effective_on a date the page shows, and with relevance they are data fields, not text.`,
    '6. If add_research_item answers dropped, move on. If it names an error, fix exactly that and call it again for that item.',
    '7. Never pad: if nothing is new and material, add nothing. Esta writes the note that says so.',
    'When you are done, reply with the single word: xong.',
  ].join('\n');
}
