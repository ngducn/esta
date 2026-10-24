import type { NoteRule, NoteViolation } from './index';
import { WORDS, type WordRow } from './words';

/** Each rule matches what it rejects in the shown text; a mask is one placeholder's private-use character. */
const CHARACTER_RULES: ReadonlyArray<{ readonly rule: NoteRule; readonly pattern: RegExp }> = [
  { rule: 'bidi', pattern: /\p{Bidi_Control}+/gu },
  { rule: 'number', pattern: /\p{N}+/gu },
  { rule: 'symbol', pattern: /[\p{Sc}%‰‱]+/gu },
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

type Token = { readonly word: string; readonly start: number; readonly end: number };

function passes(row: WordRow, before: string | undefined, after: string | undefined): boolean {
  if (before !== undefined && row.allowBefore?.includes(before) === true) return true;
  if (after !== undefined && row.allowAfter?.includes(after) === true) return true;
  return row.nearPlaceholder === true && [before, after].some((word) => word !== undefined && IS_MASK.test(word));
}

/** Words the way a reader takes them in: full-width letters folded, invisible characters dropped, any case. */
function wordViolations(shown: string): NoteViolation[] {
  const text = shown.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').toLowerCase();
  const tokens: Token[] = [...text.matchAll(TOKEN)].map((match) => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
  const spaced = (left: Token | undefined, right: Token | undefined) =>
    left !== undefined && right !== undefined && /^\s*$/u.test(text.slice(left.end, right.start));
  return tokens.flatMap((token, i): NoteViolation[] => {
    if (IS_MASK.test(token.word)) return [];
    if (NON_LATIN_LETTER.test(token.word)) return [{ rule: 'script', text: token.word }];
    const row = WORDS.get(token.word) ?? WORDS.get(token.word.replace(/['’]s$/u, ''));
    const [before, after] = [tokens[i - 1], tokens[i + 1]];
    const allowed = row === undefined || passes(row, spaced(before, token) ? before?.word : undefined, spaced(token, after) ? after?.word : undefined);
    return allowed ? [] : [{ rule: 'word', text: token.word }];
  });
}

/** What the model typed itself, as `shown` renders it with every placeholder masked. */
export function residue(shown: string): NoteViolation[] {
  const characters = CHARACTER_RULES.flatMap(({ rule, pattern }) =>
    [...shown.matchAll(pattern)].map((match) => ({ rule, text: around(shown, match.index, match.index + match[0].length) })),
  );
  return [...characters, ...wordViolations(shown)];
}
