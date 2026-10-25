import { repairMessage, type NoteViolation } from '@esta/core/guard';
import type { IsoDate } from '@esta/core/date';
import { systemPrompt } from './system';

export type AskedTurn = { readonly question: string; readonly answer: string };

const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

function conversationSoFar(turns: readonly AskedTurn[]): string[] {
  if (turns.length === 0) return [];
  return [
    '',
    'The question below follows up this conversation, oldest turn first. Its answers are what the family member read: do not copy a figure, name or link from them. Call the tools again for every record and figure this answer writes.',
    ...turns.flatMap(({ question, answer }) => ['', 'Earlier question:', question, 'Earlier answer:', answer.replace(MARKDOWN_LINK, '$1')]),
  ];
}

export function askPrompt(context: Omit<Parameters<typeof systemPrompt>[0], 'language'> & { readonly question: string; readonly earlier?: readonly AskedTurn[] }): string {
  return [
    systemPrompt({ ...context, language: 'question' }),
    '',
    'Task: answer the family member\'s question below, as a short answer they read on a phone.',
    '1. Call the tools you need before you write anything. list_properties gives each property a handle; pass that handle to the tools that take a property.',
    '2. Then write the answer in Markdown: one to four short sentences, a short list, or a table when the answer lists several records with the same fields. Use paragraphs, lists, tables, bold and links only.',
    '3. Write every number, date, amount and name as the placeholder of the field that holds it, such as {{f2.income_display}}. A field without a _display, _label or _name ending, such as status or category, is a code for you to read: write it in your own words.',
    '4. Link the record the answer comes from by its handle, as [Sổ thu chi {{f1.property_label}}](f2). Link nothing else.',
    '5. If the tools hold no data for the question, say plainly that the app does not have that information yet. Never estimate.',
    '6. If the question asks you to change something, say that you cannot change records yourself; when a change would help, suggest it with create_proposal and say a member can approve it in Hộp thư.',
    ...conversationSoFar(context.earlier ?? []),
    '',
    'Question:',
    context.question,
  ].join('\n');
}

/** A follow-up continues the session of the conversation's last answer, so its rules and context already hold. */
export function askFollowUpPrompt({ today, timezone, question, firstHandle }: { readonly today: IsoDate; readonly timezone: string; readonly question: string; readonly firstHandle: number }): string {
  return [
    `Today is ${today} in ${timezone}. The family member asks a follow-up to the conversation so far. Answer it with the rules of your first task.`,
    `The handles and placeholders of your earlier answers no longer hold. Call the tools again for every record and figure this answer writes; this turn's handles start at f${firstHandle}.`,
    '',
    'Question:',
    question,
  ].join('\n');
}

export function askRepairPrompt(violations: readonly NoteViolation[]): string {
  return `${repairMessage(violations)}\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.`;
}
