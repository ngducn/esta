import { systemPrompt } from './system';

export type ScanCaps = { readonly WebSearch: number; readonly WebFetch: number };

/** Carries the date, locale and caps but no id or name, so households seeded alike replay one recording (AGENT.md §8). */
export function researchScanPrompt(context: Parameters<typeof systemPrompt>[0] & { readonly caps: ScanCaps }): string {
  return [
    systemPrompt(context),
    '',
    "Task: the morning market scan. Find news that matters to the family's properties: land price tables, planning and zoning, infrastructure such as ring roads, metro lines, expressways, airports and bridges, the rental market for the kinds of property held, and the national rules on land, rental tax and mortgage rates.",
    '1. Call research_topics, list_properties and recent_items once each. recent_items lists the research items already stored; never add those again.',
    `2. Search with WebSearch using the topics' query_templates, Vietnamese first and English where useful. This run may make ${context.caps.WebSearch} searches and ${context.caps.WebFetch} fetches; calls past that are refused.`,
    '3. Prefer official sources (*.gov.vn, chinhphu.vn, baochinhphu.vn, provincial portals, thuvienphapluat.vn, luatvietnam.vn) and established press. Never use forums or listing sites. Fetch single articles with WebFetch; do not crawl. In its prompt, ask for the publication date and for every figure, road and law number copied word for word from the article.',
    '4. For each fetched article that is new and material, call add_research_item once. title_vi, summary_vi and why_it_matters_vi are your own words in plain text on one line: summary_vi at most sixty words, why_it_matters_vi naming the properties or provinces it touches through their _label or _name placeholders. topics and properties are the handles the item concerns.',
    '5. The number rule holds for those three texts. A figure, a road or a law number from the article, such as the name of a ring road, goes into quotes copied exactly from the page WebFetch returned, and the text cites it as {{f0.quote_1_label}}; the publication date is {{f0.published_display}}. published_on, effective_on and relevance are data fields, not text.',
    '6. If add_research_item answers dropped, move on. If it names an error, fix exactly that and call it again for that item.',
    '7. Never pad: if nothing is new and material, add nothing. Esta writes the note that says so.',
    'When you are done, reply with the single word: xong.',
  ].join('\n');
}
