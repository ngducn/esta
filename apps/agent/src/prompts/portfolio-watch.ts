import { systemPrompt } from './system';

/** Carries the date and locale but no id or name, so households seeded alike replay one recording (AGENT.md §8). */
export function portfolioWatchPrompt(context: Parameters<typeof systemPrompt>[0]): string {
  return [
    systemPrompt(context),
    '',
    'Task: the morning watch.',
    '1. Call watch_facts once. Each fact has a handle (f1, f2, …), a rule_id, a severity and text fields.',
    '2. For each fact whose severity is action, call create_item once: a short title, a body of one or two sentences that says what happened and what to do, and related set to that fact\'s handle.',
    '3. Then call create_item once for all watch and info facts together: a title, a body with one list item per fact (you may merge facts about the same place), and related set to all their handles.',
    '4. A title is one line of plain text. A body is Markdown with paragraphs, lists and bold only, no links.',
    '5. If create_item answers with an error, fix exactly what it names and call create_item again for that note.',
    '6. If watch_facts returns no facts, write no note.',
    'When every note is saved, reply with the single word: xong.',
  ].join('\n');
}
