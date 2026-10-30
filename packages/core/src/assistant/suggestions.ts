import type { WatchRuleId, WatchSeverity } from '../watch/types';
import { byPriority, isOpenNote } from './open-notes';
import type { NoteRelated } from './topic';

/** The names a suggested reply holds, read from the records the note names and never from what the model wrote. */
export type SuggestionLabels = Readonly<Partial<Record<'tenant' | 'property' | 'unit', string>>>;

/** Each suggested reply by its message key under `assistant.suggestions`, with the labels its text names. */
export const SUGGESTION_PARAMS = {
  remindTenant: ['tenant'],
  tenantLateCount: ['tenant'],
  renewLease: ['property'],
  rentFaster: ['unit'],
  briefFirst: [],
  weeklySummary: [],
} as const satisfies Record<string, ReadonlyArray<keyof SuggestionLabels>>;

export type SuggestionKey = keyof typeof SUGGESTION_PARAMS;

export const SUGGESTIONS = {
  brief: ['briefFirst'],
  weekly: ['weeklySummary'],
  W1: ['remindTenant', 'tenantLateCount'],
  W3: ['renewLease'],
  W4: ['rentFaster'],
} as const satisfies Partial<Record<'brief' | 'weekly' | WatchRuleId, readonly SuggestionKey[]>>;

type Source = keyof typeof SUGGESTIONS;
const isSource = (key: string): key is Source => Object.hasOwn(SUGGESTIONS, key);

export function noteSuggestion(kind: string, related: NoteRelated): { readonly keys: readonly SuggestionKey[]; readonly subjectKey: string | null } {
  if (kind === 'brief' || kind === 'weekly') return { keys: SUGGESTIONS[kind], subjectKey: null };
  const fact = kind === 'alert' ? related.facts.find(({ rule_id }) => isSource(rule_id)) : undefined;
  return fact === undefined || !isSource(fact.rule_id) ? { keys: [], subjectKey: null } : { keys: SUGGESTIONS[fact.rule_id], subjectKey: fact.subject_key };
}

export type SuggestionNote = {
  readonly id: string;
  readonly kind: string;
  readonly severity: WatchSeverity;
  readonly status: string;
  /** Sorts as the note's time does, so the newest note comes first among notes of one severity. */
  readonly stamp: string;
  readonly related: NoteRelated;
  readonly labels: SuggestionLabels;
};

export type Suggestion = { readonly noteId: string; readonly key: SuggestionKey; readonly params: SuggestionLabels };

export const MAX_SUGGESTIONS = 3;

/**
 * How many ranked notes get their labels read. A note's reply can lack a label or repeat the reply of an earlier note
 * (a tenant with two late invoices has two notes), so the replies can run past the first three notes.
 */
export const SUGGESTION_WINDOW = 3 * MAX_SUGGESTIONS;

type RankedSuggestionNote = Pick<SuggestionNote, 'id' | 'kind' | 'severity' | 'status' | 'stamp' | 'related'>;

/** The open notes that can offer a reply, in the order their replies lead. */
const ranked = <N extends RankedSuggestionNote>(notes: readonly N[]): N[] =>
  notes.filter((note) => isOpenNote(note.status) && noteSuggestion(note.kind, note.related).keys.length > 0).toSorted(byPriority);

/** The notes whose labels are worth reading: the first {@link SUGGESTION_WINDOW} notes that can offer a reply. */
export const suggestionCandidates = <N extends RankedSuggestionNote>(notes: readonly N[]): N[] => ranked(notes).slice(0, SUGGESTION_WINDOW);

export function suggestReplies(notes: readonly SuggestionNote[]): Suggestion[] {
  const offered = new Set<string>();
  return ranked(notes)
    .flatMap((note) =>
      noteSuggestion(note.kind, note.related).keys.flatMap((key) => {
        const names = SUGGESTION_PARAMS[key];
        if (names.some((name) => !note.labels[name])) return [];
        const params: SuggestionLabels = Object.fromEntries(names.map((name) => [name, note.labels[name]]));
        const text = JSON.stringify([key, params]);
        if (offered.has(text)) return [];
        offered.add(text);
        return [{ noteId: note.id, key, params }];
      }),
    )
    .slice(0, MAX_SUGGESTIONS);
}
