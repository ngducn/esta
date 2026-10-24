import type { Result } from '../result';
import { escapeMarkdown, fillValue, layoutChange, maskIndex, maskPlaceholders, MASKS, seams } from './placeholders';
import { residue } from './residue';
import { visibleText } from './visible-text';

export { visibleText };

/** Handle (`f1`) to the record a tool returned under it in this run. */
export type FactSheet = ReadonlyMap<string, Readonly<Record<string, unknown>>>;
export type NoteRule =
  | 'too_long'
  | 'number'
  | 'symbol'
  | 'bidi'
  | 'script'
  | 'word'
  | 'glued'
  | 'malformed'
  | 'unknown_handle'
  | 'unknown_field'
  | 'not_citable'
  | 'unsafe_value'
  | 'seam'
  | 'layout';
export type NoteViolation = { rule: NoteRule; text: string };
export type FilledNote = { text: string; template: string; cited: ReadonlyArray<{ placeholder: string; value: string }> };

/** The longest template the guard reads; with the two limits below its worst case stays under 50 ms (measured in #311). */
export const MAX_NOTE_LENGTH = 3000;
/** The Markdown parser slows quadratically with lists or quotes nested on one line and with emphasis and link delimiters. */
const MAX_NESTING = 8;
const MAX_DELIMITERS = 400;
const NESTED = new RegExp(`^[ \\t]*(?:(?:>|[*+-][ \\t]|\\d{1,9}[.)][ \\t])[ \\t]*){${MAX_NESTING + 1}}`, 'm');

function tooComplex(masked: string): string | undefined {
  const delimiters = masked.match(/[*_[\]]/g)?.length ?? 0;
  if (delimiters > MAX_DELIMITERS) return `${delimiters} of * _ [ ] > ${MAX_DELIMITERS}`;
  return NESTED.test(masked) ? `lists or quotes nested deeper than ${MAX_NESTING}` : undefined;
}

const CITE = 'Cite the tool field that holds it as {{fN.field}}';

/** Each rule's repair hint, addressed to the model. */
const RULES: Record<NoteRule, string> = {
  too_long: `Shorten the note: at most ${MAX_NOTE_LENGTH} characters, ${MAX_DELIMITERS} of * _ [ ], and lists or quotes nested ${MAX_NESTING} deep.`,
  number: `Do not type a number. ${CITE}.`,
  symbol: `Do not type a currency or percent sign; the cited value carries its unit. ${CITE}.`,
  bidi: 'Remove this invisible direction control.',
  script: `Write only Latin letters (Vietnamese or English). ${CITE} for any number.`,
  word: `Do not write an amount, unit, number word or month name. ${CITE}, such as a _display, _compact or _relative field.`,
  glued: 'Put a space between a placeholder and the next word, and no unit after it; the value carries its unit.',
  malformed: 'Write a placeholder exactly as {{fN.field}}, without spaces, and type no other braces or private-use characters.',
  unknown_handle: 'No tool returned this record in this run. Cite only handles your tools returned, as {{fN.field}}.',
  unknown_field: 'The record has no such field. Cite a field the tool returned, as {{fN.field}}.',
  not_citable: 'Cite a text field whose name ends in _display, _compact, _relative, _label or _name, as {{fN.field}}.',
  unsafe_value: 'This field holds characters that cannot be shown. Cite another field or leave it out.',
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
 * Fills each `{{fN.field}}` in `template` from `sheet` and rejects any number the model typed itself, in the text as
 * `SafeMarkdown` renders it (AGENT.md §6.3).
 */
export function checkNote(template: string, sheet: FactSheet): Result<FilledNote, NoteViolation[]> {
  if (template.length > MAX_NOTE_LENGTH) return rejected([{ rule: 'too_long', text: `${template.length} > ${MAX_NOTE_LENGTH}` }]);
  const typed = template.match(MASKS);
  if (typed !== null) return rejected(typed.map((char) => ({ rule: 'malformed', text: char })));

  const { masked, occurrences } = maskPlaceholders(template);
  const complex = tooComplex(masked);
  if (complex !== undefined) return rejected([{ rule: 'too_long', text: complex }]);
  const shown = visibleText(masked);
  const fills = occurrences.map((occurrence) => fillValue(occurrence, sheet));
  const values = fills.map((fill) => (fill.ok ? fill.value : undefined));
  const placeholders = occurrences.map(({ placeholder }) => placeholder);
  const unfilled = fills.flatMap((fill, i) => (fill.ok ? [] : [{ rule: fill.reason, text: placeholders[i] ?? '' }]));
  const found = [...residue(shown), ...unfilled, ...seams(shown, values)];
  if (found.length > 0) return rejected(found, placeholders);

  const text = masked.replace(MASKS, (mask) => escapeMarkdown(values[maskIndex(mask)] ?? ''));
  const moved = layoutChange(shown, text, values);
  if (moved.length > 0) return rejected(moved, placeholders);
  return { ok: true, value: { text, template, cited: placeholders.map((placeholder, i) => ({ placeholder, value: values[i] ?? '' })) } };
}

/** The repair turn's message: each offending text once, with what to write instead. */
export function repairMessage(violations: readonly NoteViolation[]): string {
  return dedupe(violations)
    .map(({ rule, text }) => `"${text}": ${RULES[rule]}`)
    .join('\n');
}
