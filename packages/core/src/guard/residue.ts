import type { NoteRule, NoteViolation } from './index';
import { isGluedNumber, phraseAround, ROMAN_ACRONYMS, ROMAN_LABELS, ROMAN_WORDS, WORDS, type WordRow } from './words';

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
/** A letter outside ASCII, Latin-1 (except `Ø` and `ø`, which stand in for a zero) and the Vietnamese letters, or a mark that NFKC left uncombined. */
const FOREIGN_LETTER = /[^\P{L}A-Za-z\u00C0-\u00D6\u00D9-\u00F6\u00F9-\u00FF\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]|\p{M}/u;
const DIGIT_RUN = /^[lIOo]{3,}/u;
const LOWER_ROMAN = /^[ivx]{2,3}$/u;
const ROMAN = /^(?=[mdclxvi])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/u;

type Token = { readonly word: string; readonly lower: string; readonly start: number; readonly end: number };
type Context = {
  readonly neighbors: readonly Token[];
  readonly spacedBefore: Token | undefined;
  /** The word before `spacedBefore`, when only a space or a hyphen stands between them. */
  readonly spacedBeforeThat: Token | undefined;
  readonly spacedAfter: Token | undefined;
  /** The `spacedBefore` and `spacedAfter` words with no line break between them and this one. */
  readonly sameLine: readonly Token[];
  readonly capitalized: boolean;
  /** Whether one of these `passesInPhrases` entries reads around this word. */
  readonly inPhrase: (phrases: readonly string[]) => boolean;
  readonly isDate: (mask: string) => boolean;
};

/** `lOO`, `IOO` for 100, alone or with a unit (`lOOk`, `IOOtr`). */
function isDigitLetters(word: string): boolean {
  const run = DIGIT_RUN.exec(word)?.[0];
  if (run === undefined || !/[IO]/u.test(run.slice(1))) return false;
  const suffix = word.slice(run.length).toLowerCase();
  const kind = WORDS.get(suffix)?.kind;
  return suffix === '' || kind === 'amount' || kind === 'currency';
}

const isNumberWord = (token: Token) => IS_MASK.test(token.word) || WORDS.get(token.lower)?.kind === 'number';

const isDateMask = (token: Token, isDate: (mask: string) => boolean) => IS_MASK.test(token.word) && isDate(token.word);

function passes(row: WordRow, { neighbors, spacedBefore, spacedBeforeThat, spacedAfter, sameLine, capitalized, inPhrase, isDate }: Context): boolean {
  if (row.passesLowercase === true && !capitalized) return true;
  if (row.bannedOnlyAfter !== undefined && !row.bannedOnlyAfter.includes(spacedBefore?.lower ?? '')) {
    return !(row.bannedBesideDateMask === true && sameLine.some((token) => isDateMask(token, isDate)));
  }
  if (spacedBefore !== undefined && spacedAfter !== undefined && row.passesBeforeName?.includes(spacedBefore.lower) === true && /^\p{Lu}/u.test(spacedAfter.word)) return true;
  if (row.bannedOnlyNearNumber === true && !neighbors.some(isNumberWord)) return true;
  const counted = spacedBefore !== undefined && spacedAfter !== undefined && row.countedAfter?.includes(spacedBefore.lower) === true && row.countedNouns?.includes(spacedAfter.lower) === true;
  if (!counted && spacedBefore !== undefined && row.passesAfter?.includes(spacedBefore.lower) === true) return true;
  if (spacedBefore !== undefined && spacedBeforeThat !== undefined && row.passesAfterPhrase?.includes(`${spacedBeforeThat.lower} ${spacedBefore.lower}`) === true) return true;
  if (row.passesInPhrases !== undefined && inPhrase(row.passesInPhrases)) return true;
  if (spacedAfter !== undefined && (row.passesBefore?.includes(spacedAfter.lower) === true || (capitalized && row.passesBeforeCapitalized?.includes(spacedAfter.word) === true))) return true;
  return row.passesNearDate === true && neighbors.some((token) => isDateMask(token, isDate));
}

function isRoman({ word, lower }: Token, before: Token | undefined, after: Token | undefined): boolean {
  if (!ROMAN.test(lower)) return false;
  if (LOWER_ROMAN.test(word) && before !== undefined && ROMAN_LABELS.has(before.lower)) return !ROMAN_WORDS.has(lower) || after === undefined;
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
  const lineBreak = (from: number, to: number) => text.slice(from, to).includes('\n');
  return tokens.flatMap((token, i): NoteViolation[] => {
    if (IS_MASK.test(token.word)) return [];
    if (FOREIGN_LETTER.test(token.word)) return [{ rule: 'script', text: token.word }];
    const [left, right] = [tokens[i - 1], tokens[i + 1]];
    const spacedBefore = spaced(left, token) ? left : undefined;
    const spacedBeforeThat = spacedBefore !== undefined && spaced(tokens[i - 2], left) ? tokens[i - 2] : undefined;
    const spacedAfter = spaced(token, right) ? right : undefined;
    const row = wordRow(token);
    const sameLine = [
      spacedBefore !== undefined && !lineBreak(spacedBefore.end, token.start) ? spacedBefore : undefined,
      spacedAfter !== undefined && !lineBreak(token.end, spacedAfter.start) ? spacedAfter : undefined,
    ].filter((neighbor) => neighbor !== undefined);
    const neighbors = [left, right].filter((neighbor) => neighbor !== undefined);
    const capitalized = token.word !== token.lower;
    const inPhrase = (phrases: readonly string[]) => phrases.some((phrase) => phraseAround(phrase.split(' '), tokens, i, spaced));
    const banned = isDigitLetters(token.word) || (row === undefined && isGluedNumber(token.lower)) || isRoman(token, spacedBefore, spacedAfter) || (row !== undefined && !passes(row, { neighbors, spacedBefore, spacedBeforeThat, spacedAfter, sameLine, capitalized, inPhrase, isDate }));
    return banned ? [{ rule: 'word', text: token.word }] : [];
  });
}

export function residue(shown: string, isDate: (mask: string) => boolean): NoteViolation[] {
  const characters = CHARACTER_RULES.flatMap(({ rule, pattern }) =>
    [...shown.matchAll(pattern)].map((match) => ({ rule, text: around(shown, match.index, match.index + match[0].length) })),
  );
  return [...characters, ...wordViolations(shown, isDate)];
}
