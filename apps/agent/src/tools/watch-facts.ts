import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { formatCount } from '@esta/core/format';
import { describeFacts, evaluateWatch, groupActionFacts, type DescribedFact, type WatchLabels, type WatchSnapshot } from '@esta/core/watch';
import { readWatchLabels, readWatchSnapshot } from '@esta/ops';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';

export type WatchRead = { readonly snapshot: WatchSnapshot; readonly labels: WatchLabels };

export function readWatch(db: AgentDb, householdId: string, asOf: IsoDate, timezone: string): () => Promise<WatchRead> {
  return async () => {
    const [snapshot, labels] = await Promise.all([readWatchSnapshot(db, householdId, { asOf, timezone }), readWatchLabels(db, householdId)]);
    return { snapshot, labels };
  };
}

/**
 * `watch_facts`: today's facts as citable records, and `groups`, the handles of the action facts one note tells together.
 * An action fact's record carries its group's size as `group_count_display`. A second call answers the same records
 * under the same handles.
 */
export function watchFactsTool(read: () => Promise<WatchRead>, locale: Locale, cite: RunSheet['cite'], asOf: IsoDate) {
  const facts = new Map<string, DescribedFact>();
  let records: Array<CitedRecord<DescribedFact['record']>> | undefined;
  let groups: Array<{ readonly rule_id: string; readonly facts: readonly string[] }> = [];
  return {
    facts: facts as ReadonlyMap<string, DescribedFact>,
    wasRead: () => records !== undefined,
    async run() {
      if (records === undefined) {
        const { snapshot, labels } = await read();
        const described = describeFacts(evaluateWatch(snapshot), snapshot, labels, locale);
        const found = groupActionFacts(described.map((entry, index) => ({ handle: String(index), fact: entry.fact })), asOf);
        const sizeAt = new Map(found.flatMap(({ handles }) => handles.map((index) => [index, formatCount(handles.length, locale)] as const)));
        const handleAt = new Map<string, string>();
        records = described.map((entry, index) => {
          const count = sizeAt.get(String(index));
          const record = cite(count === undefined ? entry.record : { ...entry.record, group_count_display: count });
          handleAt.set(String(index), record.handle);
          facts.set(record.handle, entry);
          return record;
        });
        groups = found.map(({ ruleId, handles }) => ({ rule_id: ruleId, facts: handles.map((index) => handleAt.get(index) ?? index) }));
      }
      return { facts: records, groups };
    },
  };
}
