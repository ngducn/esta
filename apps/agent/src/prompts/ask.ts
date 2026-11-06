import { WEB_CAPS } from '@esta/core/agent-limits';
import { officialSourcesText } from '@esta/core/research';
import { repairMessage, repairTexts, type NoteViolation } from '@esta/core/guard';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { TypedRecord } from '../tools/typed-numbers';
import type { LoadedTopic } from '../tools/topic-reads';
import { PUBLISHED_LABEL } from '@esta/core/parse/page-dates';
import { replyLanguage } from './language';
import { systemPrompt } from './system';

export type AskedTurn = { readonly question: string; readonly answer: string };

/** The phrases the guard rejects and what the model writes instead; rule 4 of the ask prompt and `ask-repair.test.ts` both read this table. */
export const STYLE_SWAPS: readonly { readonly never: string; readonly say: readonly string[] }[] = [
  { never: 'ba mẹ', say: ['bố mẹ'] },
  { never: 'hai bên', say: ['bên thuê và bên cho thuê', 'người thuê và chủ nhà'] },
  { never: 'cả hai', say: ['cả người thuê lẫn chủ nhà'] },
  { never: 'đồng loạt', say: ['cùng lúc'] },
  { never: 'phần trăm', say: ['theo tỷ lệ'] },
  { never: 'số một', say: ['hàng đầu', 'quan trọng nhất'] },
  { never: 'bên thứ ba', say: ['người ngoài hợp đồng', 'bên không ký'] },
  { never: 'the two parties', say: ['the tenant and the landlord'] },
];

const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

/**
 * The model answered some English questions in Vietnamese, the default when it is unsure (#348), so a message that is
 * clearly English, or that the household reads in English and gives no sign of Vietnamese, says so where the model
 * reads it last. Any other message keeps the default and its prompt does not change. `labels` are the household's own
 * names, which a message may hold without being written in their language.
 */
const replyLanguageLine = (question: string, locale: Locale, labels: readonly string[]): string[] =>
  replyLanguage(question, locale, labels) === 'en' ? ['The message is written in English, so write the whole reply in English.'] : [];

function conversationSoFar(turns: readonly AskedTurn[]): string[] {
  if (turns.length === 0) return [];
  return [
    '',
    'The message below follows up this conversation, oldest turn first. Its answers are what the family member read: do not copy a figure, name or link from them. Call the tools again for every record and figure this reply writes.',
    ...turns.flatMap(({ question, answer }) => ['', 'Earlier question:', question, 'Earlier answer:', answer.replace(MARKDOWN_LINK, '$1')]),
  ];
}

const OTHER_PERIOD_RATE =
  'Her message has a rate for a period other than a year or a month. Esta reads loan rates per year, so do not call a number missing and do not convert it: say that Esta reads loan rates per year and ask her for the yearly rate.';
const MONTHLY_RATE =
  'A rate she wrote per month is listed with /tháng. Never use it as a loan rate directly: first call calculate monthly_rate_to_yearly on it, then use that result as the rate of loan_payment, so both workings show.';
const isMonthly = ({ value_typed }: TypedRecord): boolean => typeof value_typed === 'object' && value_typed !== null && (value_typed as { per?: unknown }).per === 'month';

function typedSection(typed: readonly TypedRecord[] | undefined, otherPeriodRate = false): string[] {
  const note = otherPeriodRate ? ['', OTHER_PERIOD_RATE] : [];
  if (typed === undefined || typed.length === 0) return note;
  return [
    ...note,
    '',
    `Numbers the family member wrote in this conversation, each a record of this turn. Take one as an operand of calculate, such as "${typed[0]?.handle}.value_display", or cite it as {{${typed[0]?.handle}.value_display}}; never write one yourself:`,
    ...typed.map(({ handle, value_display, typed_text }) => `${handle}: ${value_display} (written "${typed_text}")`),
    ...(typed.some(isMonthly) ? [MONTHLY_RATE] : []),
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
  context: Omit<Parameters<typeof systemPrompt>[0], 'language' | 'scope'> & { readonly question: string; readonly labels: readonly string[]; readonly earlier?: readonly AskedTurn[]; readonly topic?: LoadedTopic | null; readonly typed?: readonly TypedRecord[]; readonly otherPeriodRate?: boolean },
): string {
  return [
    systemPrompt({ ...context, language: 'question', scope: 'open' }),
    '',
    'Task: reply to the family member\'s message below, as a short reply they read on a phone. They may ask anything.',
    '- About their properties, tenants, money or papers: call the tools you need before you write anything. list_properties gives each property a handle; pass that handle to the tools that take a property.',
    '- For writing, such as a Zalo message to a tenant or a short letter: write the draft ready to send, in a polite tone. Every name, amount and date in it is a placeholder of a tool field, like any answer, so call the tools first.',
    '- For advice or an explanation, such as renting by the year or how a procedure works: answer in plain words. Use no number unless a tool field holds it. A question of principle, such as renting by the year or by the month, is answered from general knowledge: call no tool, and write no number, date or count, unless they ask about their own properties or tenants.',
    '- When you recommend something about their records, such as renewing a lease: give as the reason only what the tool fields show, and never a reason that a field you cite contradicts. A tenant who paid most bills late does not pay regularly, even with nothing overdue now.',
    `- When they need a figure no tool returns, such as a market price or a rate, or ask about law, tax or procedure: look it up. Search with WebSearch in general words, never a name, nickname, street, phone or amount of the family and no number but a year; this turn may make ${WEB_CAPS.ask.WebSearch} searches and ${WEB_CAPS.ask.WebFetch} fetches. Fetch one page a search returned with WebFetch; in its prompt ask for the article's own date line copied exactly on one line that starts "${PUBLISHED_LABEL}:", and for every figure copied word for word. Then call quote_page with the page's url and each figure with the words around it, at least three words, copied exactly. Write a figure from a page only as {{fN.quote_n_label}} of that record, and name the page as {{fN.source_name}}. For law, tax or procedure use an official page (${officialSourcesText()}). Esta lists each page you quote as a numbered source under the reply. If you find no page, say plainly that you found no source; never estimate.`,
    `- When they ask what a change would bring, or for a total, a share, a percent change, a loan payment or the days between two dates: never work it out yourself. Call calculate with operands that are fields of records, such as "f3.rent_display" or a number they wrote (listed below), and write the figure as {{fN.result_display}} of its result; Esta shows the working under your reply. A rate from a page you quoted is "fN.quote_n_value_display". If a number the question needs is in no tool and they did not write it, say which number is missing and ask them to type it; write no figure.`,
    '',
    'Rules for the reply:',
    '1. Write Markdown: one to four short sentences, a short list, or a table when the reply lists several records with the same fields. Use paragraphs, lists, tables, bold and links only.',
    '2. Write every number, date, amount and name as the placeholder of the field that holds it, such as {{f2.income_display}}. A field without a _display, _label or _name ending, such as status or category, is a code for you to read: write it in your own words. This holds for a name or a numbered label the message itself holds, such as phòng 5: find its record with the tools and write its placeholder.',
    '3. Link the record the reply comes from by its handle, as [Sổ thu chi {{f1.property_label}}](f2). The link target is the bare handle in parentheses, never a placeholder or an address, and the link text is never a bare handle. Link nothing else.',
    '4. Number words count things even in advice and letters, and the app rejects them: never write hai, ba, bốn, năm, mười or two, three for a count, and write a period as theo năm, mỗi năm, hằng năm or theo tháng, never năm alone. Use a number word only when it states a figure from the data or a tool result, as that field\'s placeholder. Write each, both or cả … lẫn … instead of a count, such as mỗi cách. Swap each banned phrase for its replacement: ' + STYLE_SWAPS.map(({ say, never }) => `${say.join(' or ')} (never ${never})`).join('; ') + '.',
    '5. If the question asks you to change something, say that you cannot change records yourself; when a change would help, suggest it with create_proposal and say a member can approve it on its card in this conversation.',
    '6. Reply in the language the message is written in, whatever the language of these rules: an English message gets an English reply.',
    ...conversationSoFar(context.earlier ?? []),
    ...topicSection(context.topic),
    ...typedSection(context.typed, context.otherPeriodRate),
    '',
    ...replyLanguageLine(context.question, context.locale, context.labels),
    'Message:',
    context.question,
  ].join('\n');
}

/** A follow-up continues the session of the conversation's last answer, so its rules and context already hold. */
export function askFollowUpPrompt({ locale, today, timezone, question, labels, firstHandle, typed, otherPeriodRate }: { readonly locale: Locale; readonly today: IsoDate; readonly timezone: string; readonly question: string; readonly labels: readonly string[]; readonly firstHandle: number; readonly typed?: readonly TypedRecord[]; readonly otherPeriodRate?: boolean }): string {
  return [
    `Today is ${today} in ${timezone}. The family member writes again in the conversation so far. Reply with the rules of your first task.`,
    `The handles and placeholders of your earlier replies no longer hold. Call the tools, and calculate, again for every record and figure this reply writes, and fetch a web page again and quote it again with quote_page, since no page from an earlier turn holds; this turn's handles start at f${firstHandle}.`,
    ...typedSection(typed, otherPeriodRate),
    '',
    ...replyLanguageLine(question, locale, labels),
    'Message:',
    question,
  ].join('\n');
}

/** What follows the rejected lines of a repair turn: it names the exact words and asks for the answer again without them. */
export const repairTail = (texts: readonly string[]): string =>
  `Write the whole answer again from the start without these exact words (${[...new Set(texts)].map((text) => `"${text}"`).join(', ')}): say the same thing in other words, and cite a figure only as a placeholder. The handles you already have still hold.`;

export function askRepairPrompt(violations: readonly NoteViolation[]): string {
  return `${repairMessage(violations)}\n${repairTail(violations.map(({ text }) => text))}`;
}

/** Asks for the official page a legal answer lacks (AGENT.md §5.6 step 9). */
export const askSourceRepairPrompt = (): string =>
  `The question is about law, tax or procedure, so the reply needs an official page (${officialSourcesText()}). Search for one, fetch it with WebFetch, quote it with quote_page and name it as {{fN.source_name}}. Write the whole answer again from the start. The handles you already have still hold.`;

/** What `rejectedTexts` names for the repair that asks for a source: it holds no rejected text, and is no guard reject of a number. */
export const SOURCE_REJECT = 'official source';

/** What a repair turn says the answer was rejected for, one entry each: the guard's texts, or `SOURCE_REJECT`. Every repair names at least one. */
export function rejectedTexts(repair: string): string[] {
  return repair === askSourceRepairPrompt() ? [SOURCE_REJECT] : repairTexts(repair);
}
