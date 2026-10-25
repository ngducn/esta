import type { Result } from '../result';
import { DATE_FIELD, escapeMarkdown, fillValue, layoutChange, maskIndex, maskPlaceholders, MASKS, MAX_VALUE_LENGTH, seams } from './placeholders';
import { residue } from './residue';
import { visibleText } from './visible-text';

export { escapeMarkdown, MAX_VALUE_LENGTH, visibleText };

/** Handle (`f1`) to the record a tool returned under it in this run. */
export type FactSheet = ReadonlyMap<string, Readonly<Record<string, unknown>>>;
export type NoteRule =
  | 'too_long'
  | 'number'
  | 'symbol'
  | 'invisible'
  | 'script'
  | 'word'
  | 'glued'
  | 'malformed'
  | 'unknown_handle'
  | 'unknown_field'
  | 'not_citable'
  | 'unsafe_value'
  | 'empty_value'
  | 'seam'
  | 'layout';
export type NoteViolation = { rule: NoteRule; text: string };
export type FilledNote = { text: string; template: string; cited: ReadonlyArray<{ placeholder: string; value: string }> };

/** The longest template the guard reads. At the limits below, the slowest note found takes about 11 ms on an M3 Pro (#311). */
export const MAX_NOTE_LENGTH = 3000;
const MAX_FILLED_LENGTH = 4000;
/** `mdast-util-from-markdown` slows quadratically with lists nested on one line, emphasis delimiters and setext underlines. */
const MAX_NESTING = 8;
const MAX_DELIMITERS = 400;
const MAX_LINES = 150;
const NESTED = new RegExp(`^[ \\t]*(?:(?:>|[*+-][ \\t]|\\d{1,9}[.)][ \\t])[ \\t]*){${MAX_NESTING + 1}}`, 'm');

function tooComplex(masked: string): string | undefined {
  const lines = (masked.match(/\r\n?|\n/g)?.length ?? 0) + 1;
  if (lines > MAX_LINES) return `${lines} lines > ${MAX_LINES}`;
  const delimiters = masked.match(/[*_[\]]/g)?.length ?? 0;
  if (delimiters > MAX_DELIMITERS) return `${delimiters} of * _ [ ] > ${MAX_DELIMITERS}`;
  return NESTED.test(masked) ? `lists or quotes nested deeper than ${MAX_NESTING}` : undefined;
}

const CITE = 'Cite the tool field that holds it as {{fN.field}}';

/** Each rule's repair hint, addressed to the model. */
const RULES: Record<NoteRule, string> = {
  too_long: `Shorten the note: at most ${MAX_NOTE_LENGTH} characters (${MAX_FILLED_LENGTH} once filled), ${MAX_LINES} lines, ${MAX_DELIMITERS} of * _ [ ], and lists or quotes nested ${MAX_NESTING} deep.`,
  number: `Do not type a number. ${CITE}.`,
  symbol: `Do not type a currency or percent sign; the cited value carries its unit. ${CITE}.`,
  invisible: 'Remove this invisible character.',
  script: `Write only Latin letters (Vietnamese or English). ${CITE} for any number.`,
  word: `Do not write an amount, unit, number word, Roman numeral, or month or weekday name. ${CITE}, such as a _display, _compact or _relative field. Write people's names, nicknames and place names through a _name or _label field.`,
  glued: 'Put a space between a placeholder and the next word, and no unit after it; the value carries its unit.',
  malformed: 'Write a placeholder exactly as {{fN.field}}, without spaces, and type no other braces or private-use characters.',
  unknown_handle: 'No tool returned this record in this run. Cite only handles your tools returned, as {{fN.field}}.',
  unknown_field: 'The record has no such field. Cite a field the tool returned, as {{fN.field}}.',
  not_citable: 'Cite a text field whose name ends in _display, _compact, _relative, _label or _name, as {{fN.field}}.',
  unsafe_value: `This field cannot be shown: it is longer than ${MAX_VALUE_LENGTH} characters or holds invisible or control characters. Cite another field or leave it out.`,
  empty_value: 'This field is empty. Say the information is missing, or cite another field that holds it.',
  seam: 'These values touch and read as one number. Put a word between them.',
  layout: 'A cited value changes the Markdown around it. Keep placeholders out of code, raw HTML and the start of a line.',
};

const INVISIBLE = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}\p{Cc}\uE000-\uF8FF]/gu;
const codePoint = (char: string) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

function dedupe(violations: readonly NoteViolation[]): NoteViolation[] {
  return [...new Map(violations.map((violation) => [`${violation.rule}\u0000${violation.text}`, violation])).values()];
}

function rejected(violations: readonly NoteViolation[], placeholders: readonly string[] = []): Result<FilledNote, NoteViolation[]> {
  const readable = (text: string) => text.replace(INVISIBLE, (char) => placeholders[maskIndex(char)] ?? codePoint(char));
  return { ok: false, reason: dedupe(violations.map(({ rule, text }) => ({ rule, text: readable(text) }))) };
}

/**
 * `markdown` reads the note as `SafeMarkdown` renders it; `markdown-tables` as it renders an answer, GFM tables
 * included; `plain` reads it as literal text, as a title or an email subject shows.
 */
export type NoteFormat = 'markdown' | 'markdown-tables' | 'plain';

/**
 * Fills each `{{fN.field}}` in `template` from `sheet` and rejects any number the model typed itself, in the text as
 * it renders in `format` (AGENT.md §6.3). `linked` is the template with its record links swapped in (§5.6): the guard
 * reads and fills it, while the template limit counts only what the model wrote.
 */
export function checkNote(template: string, sheet: FactSheet, format: NoteFormat = 'markdown', linked = template): Result<FilledNote, NoteViolation[]> {
  if (template.length > MAX_NOTE_LENGTH) return rejected([{ rule: 'too_long', text: `${template.length} > ${MAX_NOTE_LENGTH}` }]);
  const typed = linked.match(MASKS);
  if (typed !== null) return rejected(typed.map((char) => ({ rule: 'malformed', text: char })));

  const { masked, occurrences } = maskPlaceholders(linked);
  const complex = tooComplex(masked);
  if (complex !== undefined) return rejected([{ rule: 'too_long', text: complex }]);
  const plain = format === 'plain';
  const tables = format === 'markdown-tables';
  const shown = plain ? masked : visibleText(masked, { tables });
  const fills = occurrences.map((occurrence) => fillValue(occurrence, sheet));
  const values = fills.map((fill) => (fill.ok ? fill.value : undefined));
  const placeholders = occurrences.map(({ placeholder }) => placeholder);
  const unfilled = fills.flatMap((fill, i) => (fill.ok ? [] : [{ rule: fill.reason, text: placeholders[i] ?? '' }]));
  const isDate = (mask: string) => DATE_FIELD.test(occurrences[maskIndex(mask)]?.field ?? '');
  const found = [...residue(shown, isDate), ...unfilled, ...seams(shown, values)];
  if (found.length > 0) return rejected(found, placeholders);

  const text = masked.replace(MASKS, (mask) => (plain ? (values[maskIndex(mask)] ?? '') : escapeMarkdown(values[maskIndex(mask)] ?? '')));
  if (text.length > MAX_FILLED_LENGTH) return rejected([{ rule: 'too_long', text: `${text.length} > ${MAX_FILLED_LENGTH} once filled` }]);
  const moved = plain ? [] : layoutChange(shown, text, values, tables);
  if (moved.length > 0) return rejected(moved, placeholders);
  return { ok: true, value: { text, template, cited: placeholders.map((placeholder, i) => ({ placeholder, value: values[i] ?? '' })) } };
}

/** The repair turn's message: each offending text once, with what to write instead. */
export function repairMessage(violations: readonly NoteViolation[]): string {
  return dedupe(violations)
    .map(({ rule, text }) => `"${text}": ${RULES[rule]}`)
    .join('\n');
}
