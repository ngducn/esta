import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { describeFacts, evaluateWatch, type DescribedFact, type WatchLabels, type WatchSnapshot } from '@esta/core/watch';
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

/** `watch_facts`: today's facts as citable records. A second call answers the same records under the same handles. */
export function watchFactsTool(read: () => Promise<WatchRead>, locale: Locale, cite: RunSheet['cite']) {
  const facts = new Map<string, DescribedFact>();
  let records: Array<CitedRecord<DescribedFact['record']>> | undefined;
  return {
    facts: facts as ReadonlyMap<string, DescribedFact>,
    wasRead: () => records !== undefined,
    async run() {
      if (records === undefined) {
        const { snapshot, labels } = await read();
        records = describeFacts(evaluateWatch(snapshot), snapshot, labels, locale).map((entry) => {
          const record = cite(entry.record);
          facts.set(record.handle, entry);
          return record;
        });
      }
      return { facts: records };
    },
  };
}
