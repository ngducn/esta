import type { NoteRule, NoteViolation } from './index';
import { ROMAN_ACRONYMS, ROMAN_LABELS, WORDS, type WordRow } from './words';

/** Each rule matches what it rejects in the shown text; a mask is one placeholder's private-use character. */
const CHARACTER_RULES: ReadonlyArray<{ readonly rule: NoteRule; readonly pattern: RegExp }> = [
  { rule: 'invisible', pattern: /\p{Default_Ignorable_Code_Point}+/gu },
  { rule: 'number', pattern: /\p{N}+/gu },
  { rule: 'symbol', pattern: /(?:[\p{Sc}%‰‱％﹪٪💯🔟]|\u20E3)+/gu },
  { rule: 'malformed', pattern: /[{}]+/gu },
  { rule: 'glued', pattern: /[\p{L}\p{M}][\uE000-\uF8FF]|[\uE000-\uF8FF][\p{L}\p{M}]/gu },
];

const SPAN = 24;

/** The match with the rest of its whitespace-delimited token, bounded so a long run costs no more than its match. */
function around(text: string, start: number, end: number): string {
  const before = /\S*$/u.exec(text.slice(Math.max(0, start - SPAN), start))?.[0] ?? '';
  const after = /^\S*/u.exec(text.slice(end, end + SPAN))?.[0] ?? '';
  return `${before}${text.slice(start, Math.min(end, start + SPAN))}${after}`;
}

const TOKEN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|[\uE000-\uF8FF]/gu;
const IS_MASK = /^[\uE000-\uF8FF]$/u;
const NON_LATIN_LETTER = /[^\P{L}\p{Script=Latin}]/u;
const ROMAN = /^(?=[mdclxvi])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/u;

type Token = { readonly word: string; readonly lower: string; readonly start: number; readonly end: number };
type Context = {
  readonly neighbors: readonly Token[];
  readonly spacedBefore: Token | undefined;
  /** The word before `spacedBefore`, when only a space or a hyphen stands between them. */
  readonly spacedBeforeThat: Token | undefined;
  readonly spacedAfter: Token | undefined;
  readonly isDate: (mask: string) => boolean;
};

const isNumberWord = (token: Token) => IS_MASK.test(token.word) || WORDS.get(token.lower)?.kind === 'number';

function passes(row: WordRow, { neighbors, spacedBefore, spacedBeforeThat, spacedAfter, isDate }: Context): boolean {
  if (row.bannedOnlyAfter !== undefined && !row.bannedOnlyAfter.includes(spacedBefore?.lower ?? '')) return true;
  if (row.bannedOnlyNearNumber === true && !neighbors.some(isNumberWord)) return true;
  if (spacedBefore !== undefined && row.passesAfter?.includes(spacedBefore.lower) === true) return true;
  if (spacedBefore !== undefined && spacedBeforeThat !== undefined && row.passesAfterPhrase?.includes(`${spacedBeforeThat.lower} ${spacedBefore.lower}`) === true) return true;
  if (spacedAfter !== undefined && (row.passesBefore?.includes(spacedAfter.lower) === true || row.passesBeforeCapitalized?.includes(spacedAfter.word) === true)) return true;
  return row.passesNearDate === true && neighbors.some((token) => IS_MASK.test(token.word) && isDate(token.word));
}

function isRoman({ word, lower }: Token, before: Token | undefined): boolean {
  if (!ROMAN.test(lower)) return false;
  if (lower.length === 1) return 'ivx'.includes(lower) && before !== undefined && ROMAN_LABELS.has(before.lower);
  return lower.length >= 4 || (word === word.toUpperCase() && !ROMAN_ACRONYMS.has(word));
}

function wordRow(token: Token): WordRow | undefined {
  return WORDS.get(token.lower) ?? WORDS.get(token.lower.replace(/['’]s$/u, ''));
}

function wordViolations(shown: string, isDate: (mask: string) => boolean): NoteViolation[] {
  const text = shown.normalize('NFKC');
  const tokens: Token[] = [...text.matchAll(TOKEN)].map((match) => ({
    word: match[0],
    lower: match[0].toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
  // A hyphen joins a compound as a space does (`double-check`), so a rule that reads the next word reads it there too.
  const spaced = (left: Token | undefined, right: Token | undefined) =>
    left !== undefined && right !== undefined && /^(?:\s*|-)$/u.test(text.slice(left.end, right.start));
  return tokens.flatMap((token, i): NoteViolation[] => {
    if (IS_MASK.test(token.word)) return [];
    if (NON_LATIN_LETTER.test(token.word)) return [{ rule: 'script', text: token.word }];
    const [left, right] = [tokens[i - 1], tokens[i + 1]];
    const spacedBefore = spaced(left, token) ? left : undefined;
    const spacedBeforeThat = spacedBefore !== undefined && spaced(tokens[i - 2], left) ? tokens[i - 2] : undefined;
    const spacedAfter = spaced(token, right) ? right : undefined;
    const row = wordRow(token);
    const neighbors = [left, right].filter((neighbor) => neighbor !== undefined);
    const banned = isRoman(token, spacedBefore) || (row !== undefined && !passes(row, { neighbors, spacedBefore, spacedBeforeThat, spacedAfter, isDate }));
    return banned ? [{ rule: 'word', text: token.word }] : [];
  });
}

export function residue(shown: string, isDate: (mask: string) => boolean): NoteViolation[] {
  const characters = CHARACTER_RULES.flatMap(({ rule, pattern }) =>
    [...shown.matchAll(pattern)].map((match) => ({ rule, text: around(shown, match.index, match.index + match[0].length) })),
  );
  return [...characters, ...wordViolations(shown, isDate)];
}
