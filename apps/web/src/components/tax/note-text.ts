import { TAX_NOTES, type TaxNoteKey, type TaxRule } from '@esta/core/tax';
import type { getTranslations } from 'next-intl/server';

type NotesT = Awaited<ReturnType<typeof getTranslations<'taxNotes'>>>;

/** A note as the card and `/dev/core#tax` print it: `Giả định: …` or `Lưu ý: …`, with the rule's own note where it has one. */
export function taxNoteText(key: TaxNoteKey, rule: TaxRule, notes: NotesT): string {
  const note = TAX_NOTES[key];
  const text = note.showsRuleNote ? notes(note.messageKey, { note: rule.note ?? '' }) : notes(note.messageKey);
  if (note.label === 'assumption') return `${notes('labelAssumption')}: ${text}`;
  if (note.label === 'ask_accountant') return `${notes('labelAskAccountant')}: ${text}`;
  return text;
}
