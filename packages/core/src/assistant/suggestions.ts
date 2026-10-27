import { mostSevereFirst, type WatchRuleId, type WatchSeverity } from '../watch/types';
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

/** What she may reply to a note, by its kind or by the watch rule of the fact it tells (AGENT.md §5.6 step 8). */
export const SUGGESTIONS = {
  brief: ['briefFirst'],
  weekly: ['weeklySummary'],
  W1: ['remindTenant', 'tenantLateCount'],
  W3: ['renewLease'],
  W4: ['rentFaster'],
} as const satisfies Partial<Record<'brief' | 'weekly' | WatchRuleId, readonly SuggestionKey[]>>;

type Source = keyof typeof SUGGESTIONS;
const isSource = (key: string): key is Source => Object.hasOwn(SUGGESTIONS, key);

/** A note's suggested replies and the watch subject whose labels they name: its first fact whose rule suggests any. */
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

const OPEN = new Set(['new', 'read']);

/**
 * Up to three replies from her open notes, the most severe note first, then the newest. A reply whose label the
 * records do not hold, or that repeats one already offered, is left out.
 */
export function suggestReplies(notes: readonly SuggestionNote[]): Suggestion[] {
  const offered = new Set<string>();
  return notes
    .filter((note) => OPEN.has(note.status))
    .toSorted((a, b) => mostSevereFirst(a.severity, b.severity) || (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))
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
