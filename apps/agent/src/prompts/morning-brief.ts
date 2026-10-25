import { systemPrompt } from './system';

/** Carries the date and locale but no id or name, so households seeded alike replay one recording (AGENT.md §8). */
export function morningBriefPrompt(context: Parameters<typeof systemPrompt>[0]): string {
  return [
    systemPrompt(context),
    '',
    'Task: the morning brief, the one short note the family reads first.',
    '1. Call watch_facts once, then recent_items once to see the notes already left today. Each record has a handle (f1, f2, …) and text fields.',
    '2. Call create_brief once with {"summary", "todo", "watch"}. Each line is {"text": one line of plain text, "related": the handles of the facts it tells}.',
    '3. summary: one line on what matters most today. todo: one line per action fact, most urgent first. watch: one line per watch fact; add info facts while there is room. At most five lines each; you may merge facts about the same place into one line.',
    '4. Write plain text only, with no Markdown, links or line breaks; Esta links each line to its record. Keep the brief under 300 words.',
    '5. If create_brief answers with an error, fix exactly what it names and call create_brief again.',
    '6. If watch_facts returns no facts, still save a brief: a summary that says nothing needs doing today, and empty lists.',
    'When the brief is saved, reply with the single word: xong.',
  ].join('\n');
}
