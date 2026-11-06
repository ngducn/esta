import type { IsoDate } from '../date/iso-date';
import type { Locale } from '../format';
import { isOfficialHost } from '../research/official-sources';

/** A page an answer quotes, as `messages.refs` holds it and the thread shows it as a numbered chip (P5-14). */
export type SourceRef = { readonly kind: 'source'; readonly n: number; readonly url: string; readonly source_name: string; readonly published_on: IsoDate | null };

export type AnswerRef = string | SourceRef;

export const isSourceRef = (ref: unknown): ref is SourceRef =>
  typeof ref === 'object' && ref !== null && (ref as { kind?: unknown }).kind === 'source' && typeof (ref as { url?: unknown }).url === 'string' && typeof (ref as { n?: unknown }).n === 'number' && typeof (ref as { source_name?: unknown }).source_name === 'string';

/** What Trợ lý answers when a legal question finds no official page, in the language of the reply. The message files hold the same text for the web; a test keeps them equal. */
export const NO_SOURCE_SENTENCE: Readonly<Record<Locale, string>> = {
  vi: 'Trợ lý chưa tìm được nguồn chính thức cho câu này, nên chưa dám trả lời. Bạn nên hỏi cơ quan có thẩm quyền hoặc công chứng viên để chắc chắn.',
  en: 'Trợ lý found no official source for this, so it will not answer. Please confirm with the relevant office or a notary.',
};

/** Words that make a question one about law, tax or procedure, matched on whole words with their diacritics, so `thuê` is not `thuế`. */
export const LEGAL_TERMS: readonly string[] = ['luật', 'nghị định', 'thông tư', 'thuế', 'thủ tục', 'sang tên', 'công chứng', 'sổ đỏ', 'sổ hồng', 'quy định', 'pháp lý', 'law', 'tax', 'procedure', 'legal', 'notary'];

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const LEGAL = new RegExp(`(?<![\\p{L}\\p{N}])(?:${LEGAL_TERMS.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'iu');

export const isLegalQuestion = (question: string): boolean => LEGAL.test(question.normalize('NFC'));

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** A legal answer needs an official page among its source chips, or a `tax_position` field when it is about her own tax. */
export function checkSources(question: string, refs: readonly AnswerRef[], citesTaxPosition = false): { readonly ok: boolean } {
  if (!isLegalQuestion(question) || citesTaxPosition) return { ok: true };
  return { ok: refs.some((ref) => isSourceRef(ref) && isOfficialHost(hostOf(ref.url))) };
}
