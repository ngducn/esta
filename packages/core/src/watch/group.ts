import { WATCH_RULES, watchDedupeKey } from './registry';
import type { WatchFact, WatchSnapshot } from './types';

/** The most facts one note may relate, which `watchNoteSchema` caps. */
export const MAX_GROUP_FACTS = 30;

export type WatchGroup = { readonly ruleId: WatchFact['ruleId']; readonly dedupeKey: string; readonly handles: readonly string[] };

/**
 * The notes the action facts of a day are told in: every action fact of a rule that repeats daily goes in one note
 * keyed by the rule and the day, so a rerun finds it however many facts it holds, and a fact that joins later is told
 * the next day. A rule that repeats yearly keeps one note for each fact, because its once-a-year key is the fact's own.
 * `entries` come in handle order; a group past `MAX_GROUP_FACTS` continues in a second note.
 */
export function groupActionFacts(entries: ReadonlyArray<{ readonly handle: string; readonly fact: WatchFact }>, asOf: WatchSnapshot['asOf']): WatchGroup[] {
  const groups: WatchGroup[] = [];
  for (const rule of WATCH_RULES) {
    const handles = entries.filter(({ fact }) => fact.ruleId === rule.id && fact.severity === 'action');
    if (rule.repeat === 'yearly') {
      for (const { handle, fact } of handles) groups.push({ ruleId: rule.id, dedupeKey: watchDedupeKey(fact, asOf), handles: [handle] });
      continue;
    }
    for (let start = 0; start < handles.length; start += MAX_GROUP_FACTS) {
      const part = start / MAX_GROUP_FACTS;
      groups.push({ ruleId: rule.id, dedupeKey: `watch:${rule.id}:group:${asOf}${part === 0 ? '' : `:${part + 1}`}`, handles: handles.slice(start, start + MAX_GROUP_FACTS).map(({ handle }) => handle) });
    }
  }
  return groups;
}
