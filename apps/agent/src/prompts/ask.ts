import { repairMessage, type NoteViolation } from '@esta/core/guard';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { LoadedTopic } from '../tools/topic-reads';
import { replyLanguage } from './language';
import { systemPrompt } from './system';

export type AskedTurn = { readonly question: string; readonly answer: string };

const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

/**
 * The model answered some English questions in Vietnamese, the default when it is unsure (#348), so a message that is
 * clearly English, or that the household reads in English and gives no sign of Vietnamese, says so where the model
 * reads it last. Any other message keeps the default and its prompt does not change.
 */
const replyLanguageLine = (question: string, locale: Locale): string[] => (replyLanguage(question, locale) === 'en' ? ['The message is written in English, so write the whole reply in English.'] : []);

function conversationSoFar(turns: readonly AskedTurn[]): string[] {
  if (turns.length === 0) return [];
  return [
    '',
    'The message below follows up this conversation, oldest turn first. Its answers are what the family member read: do not copy a figure, name or link from them. Call the tools again for every record and figure this reply writes.',
    ...turns.flatMap(({ question, answer }) => ['', 'Earlier question:', question, 'Earlier answer:', answer.replace(MARKDOWN_LINK, '$1')]),
  ];
}

function topicSection(topic: LoadedTopic | null | undefined): string[] {
  if (topic == null) return [];
  const intro =
    topic.kind === 'note'
      ? [
          'The message replies to this note Trợ lý left earlier. Read it as context only: never copy a figure, date or name from its text, and write each from a record below or from a tool.',
          `Note title: ${topic.title}`,
          ...(topic.body === null ? [] : ['Note text:', topic.body]),
        ]
      : [`The message asks about the property ${topic.propertyHandle} of list_properties.`];
  return [
    '',
    ...intro,
    'Esta called these tools for it before your turn. Their records hold your first handles; cite them like any tool answer and call more tools for anything else:',
    ...topic.calls.map(({ name, input, answer }) => `${name} ${JSON.stringify(input)} answered ${answer}`),
  ];
}

export function askPrompt(
  context: Omit<Parameters<typeof systemPrompt>[0], 'language' | 'scope'> & { readonly question: string; readonly earlier?: readonly AskedTurn[]; readonly topic?: LoadedTopic | null },
): string {
  return [
    systemPrompt({ ...context, language: 'question', scope: 'open' }),
    '',
    'Task: reply to the family member\'s message below, as a short reply they read on a phone. They may ask anything.',
    '- About their properties, tenants, money or papers: call the tools you need before you write anything. list_properties gives each property a handle; pass that handle to the tools that take a property.',
    '- For writing, such as a Zalo message to a tenant or a short letter: write the draft ready to send, in a polite tone. Every name, amount and date in it is a placeholder of a tool field, like any answer, so call the tools first.',
    '- For advice or an explanation, such as renting by the year or how a procedure works: answer in plain words. Use no number unless a tool field holds it.',
    '- When they need a figure that no tool returns, such as a market price or a rate: say plainly that the app has no such figure and that you cannot look things up on the web yet. Never estimate.',
    '',
    'Rules for the reply:',
    '1. Write Markdown: one to four short sentences, a short list, or a table when the reply lists several records with the same fields. Use paragraphs, lists, tables, bold and links only.',
    '2. Write every number, date, amount and name as the placeholder of the field that holds it, such as {{f2.income_display}}. A field without a _display, _label or _name ending, such as status or category, is a code for you to read: write it in your own words. This holds for a name or a numbered label the message itself holds, such as phòng 5: find its record with the tools and write its placeholder.',
    '3. Link the record the reply comes from by its handle, as [Sổ thu chi {{f1.property_label}}](f2). The link target is the bare handle in parentheses, never a placeholder or an address, and the link text is never a bare handle. Link nothing else.',
    '4. Number words count things even in advice and letters, and the app rejects them: never write hai, ba, bốn, năm, mười or two, three for a count, and write a period as theo năm, mỗi năm, hằng năm or theo tháng, never năm alone. Write each, both or cả … lẫn … instead of a count, such as mỗi cách or bên thuê và bên cho thuê.',
    '5. If the question asks you to change something, say that you cannot change records yourself; when a change would help, suggest it with create_proposal and say a member can approve it on its card in this conversation.',
    '6. Reply in the language the message is written in, whatever the language of these rules: an English message gets an English reply.',
    ...conversationSoFar(context.earlier ?? []),
    ...topicSection(context.topic),
    '',
    ...replyLanguageLine(context.question, context.locale),
    'Message:',
    context.question,
  ].join('\n');
}

/** A follow-up continues the session of the conversation's last answer, so its rules and context already hold. */
export function askFollowUpPrompt({ locale, today, timezone, question, firstHandle }: { readonly locale: Locale; readonly today: IsoDate; readonly timezone: string; readonly question: string; readonly firstHandle: number }): string {
  return [
    `Today is ${today} in ${timezone}. The family member writes again in the conversation so far. Reply with the rules of your first task.`,
    `The handles and placeholders of your earlier replies no longer hold. Call the tools again for every record and figure this reply writes; this turn's handles start at f${firstHandle}.`,
    '',
    ...replyLanguageLine(question, locale),
    'Message:',
    question,
  ].join('\n');
}

export function askRepairPrompt(violations: readonly NoteViolation[]): string {
  return `${repairMessage(violations)}\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.`;
}
