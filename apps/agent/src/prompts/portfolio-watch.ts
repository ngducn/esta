import { systemPrompt } from './system';

/** Carries the date and locale but no id or name, so households seeded alike replay one recording (AGENT.md §8). */
export function portfolioWatchPrompt(context: Parameters<typeof systemPrompt>[0]): string {
  return [
    systemPrompt(context),
    '',
    'Task: the morning watch.',
    '1. Call watch_facts once. Each fact has a handle (f1, f2, …), a rule_id, a severity and text fields. groups lists the handles of the action facts that one note tells together.',
    '2. For each group, call create_item once: related is exactly the handles of that group. The title says what is due in a few words and may cite group_count_display from any fact of the group. The body says what happened and what to do. When the group has one fact, it names the tenant or place, the amount owed, the due date and the days overdue, whichever that fact has. When the group has several facts, it gives one list item for each fact that names its place and carries that fact\'s own figures (tenant, amount owed, due date, days). Write calmly and plainly, as in a note to a relative, with no alarm words.',
    '3. Then call create_item once for all watch and info facts together: a title, a body with one list item per fact (you may merge facts about the same place), and related set to all their handles.',
    '4. Make all the create_item calls in the same turn, one after another in a single message, so the run stays short.',
    '5. A title is one line of plain text. A body is Markdown with paragraphs, lists and bold only, no links.',
    '6. If create_item answers with an error, fix exactly what it names and call create_item again for that note.',
    '7. If watch_facts returns no facts, write no note.',
    'When every note is saved, reply with the single word: xong.',
  ].join('\n');
}
