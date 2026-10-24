import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { describeFacts, evaluateWatch, type DescribedFact, type WatchLabels, type WatchSnapshot } from '@esta/core/watch';
import type { Json } from '@esta/db';
import { readWatchLabels, readWatchSnapshot } from '@esta/ops';
import { portfolioWatchPrompt } from '../prompts/portfolio-watch';
import { watchNoteWriter, type NoteBinding } from '../tools/create-item';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { estaTool } from '../tools/server';
import type { JobContext, PreparedJob } from './registry';

export type WatchRead = { readonly snapshot: WatchSnapshot; readonly labels: WatchLabels };

export type WatchRequestInput = Omit<NoteBinding, 'sheet' | 'facts'> & { readonly timezone: string; read(): Promise<WatchRead> };

/**
 * The portfolio_watch request: watch_facts reads today's facts into the run's sheet, and create_item writes each note
 * through the number guard. The worker and the golden test build it here, so a recording hashes the prompt the worker
 * ships.
 */
export function portfolioWatchRequest(input: WatchRequestInput): PreparedJob {
  const { sheet, cite } = runSheet();
  const facts = new Map<string, DescribedFact>();
  let read = false;
  const notes = watchNoteWriter({ ...input, sheet, facts });
  const watchFacts = async () => {
    const { snapshot, labels } = await input.read();
    read = true;
    const described = describeFacts(evaluateWatch(snapshot), snapshot, labels, input.locale);
    return {
      facts: described.map((entry) => {
        const record = cite(entry.record);
        facts.set(record.handle, entry);
        return record;
      }),
    };
  };
  return {
    prompt: portfolioWatchPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone }),
    tools: new Map([estaTool('watch_facts', watchFacts), estaTool('create_item', notes.write)]),
    async finish() {
      if (!read) throw new Error('The model ended without reading watch_facts');
      const missed = [...facts].filter(([handle, { fact }]) => fact.severity === 'action' && !notes.covered.has(handle));
      if (missed.length > 0) throw new Error(`The model left action facts without a note: ${missed.map(([handle, { fact }]) => `${handle} (${fact.ruleId})`).join(', ')}`);
      return { as_of: input.asOf, facts: facts.size, notes: notes.written } as unknown as Json;
    },
  };
}

export async function preparePortfolioWatch({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const asOf: IsoDate = (await clock()).today();
  const locale: Locale = await householdLocale(db, job.household_id);
  return portfolioWatchRequest({
    db,
    householdId: job.household_id,
    jobId: job.id,
    locale,
    asOf,
    timezone,
    clock,
    read: async () => {
      const [snapshot, labels] = await Promise.all([readWatchSnapshot(db, job.household_id, { asOf, timezone }), readWatchLabels(db, job.household_id)]);
      return { snapshot, labels };
    },
  });
}
