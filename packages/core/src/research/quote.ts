import type { Result } from '../result';
import { wordCount } from '../agent-schemas/text';

/** A figure is quoted with the words around it, so a bare `50` or `9` cannot borrow a match from `150` or a date. */
export const MIN_QUOTE_WORDS = 3;

const squash = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const DIGIT = /\p{N}/u;
const NUMBER_SEPARATOR = /[.,/]/u;

/** Whether a quote edge `edge` cuts into a word or number the page runs on with `next`, then `beyond`: `500` in `1.500`, `5` in `5,5`, `% giá` in `15% giá`. */
function cutsIn(edge: string, next: string, beyond: string): boolean {
  if (WORD_CHAR.test(edge)) return WORD_CHAR.test(next) || (DIGIT.test(edge) && NUMBER_SEPARATOR.test(next) && DIGIT.test(beyond));
  return edge !== ' ' && DIGIT.test(next);
}

/** The quote as the page writes it, when the page holds it whole: never inside a longer word or number. */
export function quoteOnPage(quote: string, page: string): Result<string, 'too_short' | 'not_on_page'> {
  const wanted = squash(quote);
  if (wordCount(wanted) < MIN_QUOTE_WORDS) return { ok: false, reason: 'too_short' };
  const text = squash(page);
  for (let at = text.indexOf(wanted); at !== -1; at = text.indexOf(wanted, at + 1)) {
    const end = at + wanted.length;
    const cut = cutsIn(wanted[0] ?? ' ', text[at - 1] ?? ' ', text[at - 2] ?? ' ') || cutsIn(wanted.at(-1) ?? ' ', text[end] ?? ' ', text[end + 1] ?? ' ');
    if (!cut) return { ok: true, value: wanted };
  }
  return { ok: false, reason: 'not_on_page' };
}
