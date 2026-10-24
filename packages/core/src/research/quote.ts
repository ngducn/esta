import type { Result } from '../result';
import { wordCount } from '../agent-schemas/text';

/** A figure is quoted with the words around it, so a bare `50` or `9` cannot borrow a match from `150` or a date. */
export const MIN_QUOTE_WORDS = 3;

const squash = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** The quote as the page writes it, when the page holds it whole: never inside a longer word or number. */
export function quoteOnPage(quote: string, page: string): Result<string, 'too_short' | 'not_on_page'> {
  const wanted = squash(quote);
  if (wordCount(wanted) < MIN_QUOTE_WORDS) return { ok: false, reason: 'too_short' };
  const text = squash(page);
  for (let at = text.indexOf(wanted); at !== -1; at = text.indexOf(wanted, at + 1)) {
    const before = text[at - 1] ?? ' ';
    const after = text[at + wanted.length] ?? ' ';
    const edgeOk = (edge: string, inside: string | undefined) => !(WORD_CHAR.test(edge) && WORD_CHAR.test(inside ?? ''));
    if (edgeOk(before, wanted[0]) && edgeOk(after, wanted.at(-1))) return { ok: true, value: wanted };
  }
  return { ok: false, reason: 'not_on_page' };
}
