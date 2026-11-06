import { WORDS } from '@esta/core/guard';

/** A phrase the query may not hold in a row, or a person's name it may not hold two words of, in any order. */
export type SearchTerm = string | { readonly person: string };

export type SearchDenial = { readonly code: 'number' | 'family_data'; readonly reason: string };

export const foldText = (text: string): string => text.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();

const words = (text: string): string[] => foldText(text).match(/\p{L}+|\d+/gu) ?? [];

/** What people write before a street's own name: the type word, whole or short. */
const STREET_TYPE = /^(?:(?:duong|dai lo|quoc lo|tinh lo|huong lo|pho|hem|kiet|ngo|ngach|ql|tl|dt|d|p)\s+)+/u;

const stripStreetType = (phrase: string): string => phrase.replace(STREET_TYPE, '');

const YEAR = /^(?:19|20)\d{2}$/u;

const SYMBOLS = /[₫%]/u;

const NO_NUMBER = 'a search holds no number except a four-digit year, so no phone, amount or room number leaves Esta';

const SHORT_FORMS: Readonly<Record<string, string>> = { dong: 'đồng' };

/** Whether the word at `index` is an amount or a currency in this query: `tỷ giá` and `Đồng Nai` are not, `hai tỷ` and `500 đồng` are. */
function isAmountWord(tokens: readonly string[], index: number, raw: readonly string[]): boolean {
  const word = raw[index] ?? '';
  const row = WORDS.get(SHORT_FORMS[word] ?? word) ?? WORDS.get(word);
  if (row === undefined || (row.kind !== 'amount' && row.kind !== 'currency')) return false;
  if (row.bannedOnlyNearNumber === true) return /^\d+$/u.test(tokens[index - 1] ?? '') || /^\d+$/u.test(tokens[index + 1] ?? '');
  const before = foldText(raw[index - 1] ?? '');
  const after = foldText(raw[index + 1] ?? '');
  const passes = (list: readonly string[] | undefined, other: string) => list?.some((entry) => foldText(entry) === other) ?? false;
  return !(passes(row.passesAfter, before) || passes(row.passesBefore, after));
}

/** The query as lower-cased NFKC tokens that keep their diacritics, so the word table reads them as written. */
const rawWords = (text: string): string[] => text.normalize('NFKC').toLowerCase().match(/\p{L}+|\d+|[₫%]/gu) ?? [];

function numberDenial(query: string): SearchDenial | null {
  const raw = rawWords(query);
  const folded = raw.map(foldText);
  const asked = (reason: string): SearchDenial => ({ code: 'number', reason });
  if (SYMBOLS.test(query.normalize('NFKC'))) return asked(NO_NUMBER);
  for (const [index, token] of folded.entries()) {
    if (/^\d+$/u.test(token)) {
      const neighbours = [index - 1, index + 1];
      if (!YEAR.test(token) || neighbours.some((at) => isAmountWord(folded, at, raw))) return asked(NO_NUMBER);
    } else if (isAmountWord(folded, index, raw)) {
      return asked('a search holds no amount, in digits or in words, so no price or loan leaves Esta');
    }
  }
  return null;
}

const held = (query: readonly string[], phrase: readonly string[]): boolean => {
  if (phrase.length === 0) return false;
  const at = ` ${query.join(' ')} `;
  return at.includes(` ${phrase.join(' ')} `);
};

function namesFamily(query: readonly string[], term: SearchTerm): boolean {
  if (typeof term !== 'string') {
    const parts = [...new Set(words(term.person).filter((part) => part.length >= 2))];
    if (parts.length === 1) return parts[0] !== undefined && parts[0].length >= 4 && query.includes(parts[0]);
    return parts.filter((part) => query.includes(part)).length >= 2;
  }
  const phrase = words(stripStreetType(foldText(term)));
  return phrase.join('').length >= 4 && held(query, phrase);
}

/** Why a WebSearch query may not leave the house, or null: family data stays out of search words [app rule] (AGENT.md §6.4). */
export function searchDenial(query: string, family: readonly SearchTerm[]): SearchDenial | null {
  const number = numberDenial(query);
  if (number !== null) return number;
  const asked = words(query);
  return family.some((term) => namesFamily(asked, term))
    ? { code: 'family_data', reason: "a search holds no name, nickname or street of the family's records; search the topic in general words, with a province or commune at most" }
    : null;
}
