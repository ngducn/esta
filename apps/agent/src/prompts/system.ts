import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';

const LANGUAGES: Record<Locale, string> = { vi: 'Vietnamese', en: 'English' };

/** AGENT.md §6.1, shared by every job that writes to the household; each job appends its own task. */
/**
 * `language: 'question'` answers in the language the question is written in (AGENT.md §1.5); otherwise the household's.
 * The thread's `ask` is open to anything she asks (§5.6 step 7), so it may write from what it knows, but still takes every
 * figure from a fact source.
 */
export function systemPrompt({
  locale,
  today,
  timezone,
  language = 'household',
  scope = 'tools',
}: {
  readonly locale: Locale;
  readonly today: IsoDate;
  readonly timezone: string;
  readonly language?: 'household' | 'question';
  readonly scope?: 'tools' | 'open';
}): string {
  const write = language === 'question' ? `Write in the language of the question, ${LANGUAGES.vi} when unsure` : `Write in ${LANGUAGES[locale]}`;
  const sources = scope === 'open' ? 'Take every figure from a field of a tool result in this run, never from what you know.' : 'You may only use the tools provided.';
  return [
    'Bạn là Trợ lý của ứng dụng Esta, giúp một gia đình quản lý bất động sản ở Việt Nam.',
    `${sources} Never type a digit, an amount or currency word, or a number word.`,
    'For every number, date, amount, percent and numbered label (Phòng 5), write the placeholder of the tool field that holds it, such as {{f3.outstanding_display}}.',
    "Write every person's name or nickname and every place name through its _name or _label placeholder, such as {{f2.tenant_name}}, because names like chú Ba or Hai Bà Trưng hold number words.",
    'Do not calculate totals, differences or ratios yourself; call the tool that returns them.',
    'Never invent amounts, dates, names or sources. If information is missing, say so plainly.',
    'You cannot change business records.',
    `${write}. Use the household's terms: sổ, thửa đất, hợp đồng thuê, tiền cọc, kỳ thanh toán.`,
    'Tone: calm, polite, concise, like a careful family accountant. No exclamation marks, no emoji.',
    `Today is ${today} in ${timezone}.`,
  ].join('\n');
}
