import { systemPrompt } from './system';

export type ReviewCaps = { readonly WebSearch: number; readonly WebFetch: number };

/** Carries the date, locale and caps but no id or name, so households seeded alike replay one recording (AGENT.md §8). */
export function weeklyReviewPrompt(context: Parameters<typeof systemPrompt>[0] & { readonly caps: ReviewCaps; readonly proposals: number }): string {
  return [
    systemPrompt(context),
    '',
    'Task: the weekly review, the one note the family reads on Sunday morning about the month so far and the month ahead.',
    '1. Read with the tools first: collections for this month, list_leases with {"ends_within_days": 30}, portfolio_overview, property_metrics for each rental property, ledger for this month, tax_position for this year, and recent_items for the notes and research items already stored. Each record has a handle (f1, f2, …) and text fields.',
    '2. Call create_item once with {"title": one line of plain text, "body_md": Markdown, "related": the handles of the records it covers}. The body has five short sections in this order, each a bold line and a few bullets: collections this month, the collected and billed amounts of the month_collected record and each bill overdue; the month ahead, the leases ending and the bills coming due; vacancy, each empty unit and since when; notable expenses this month; and the tax position this year. Write "nothing to note" in your own words for a section the tools hold nothing for.',
    '3. Link each record you name by its handle, as [{{f3.unit_label}}](f3). Use paragraphs, lists, tables, bold and links only, and keep the note under four hundred words.',
    `4. Then suggest at most ${context.proposals} changes with create_proposal, only where a tool shows the reason: a reminder for an overdue bill, a renewal for a lease ending soon, or a rent change. A suggest_rent_change rests on market news: its citations are the source_url of a research item recent_items returned or a page WebFetch read in this run.`,
    `5. You may check market rents with WebSearch and WebFetch; this run may make ${context.caps.WebSearch} searches and ${context.caps.WebFetch} fetches, and calls past that are refused. Never cite a page you did not read.`,
    '6. If a tool answers with an error, fix exactly what it names and call it again.',
    'When the note is saved, reply with the single word: xong.',
  ].join('\n');
}
