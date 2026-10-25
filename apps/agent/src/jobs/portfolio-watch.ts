import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { portfolioWatchPrompt } from '../prompts/portfolio-watch';
import { watchNoteWriter, type NoteBinding } from '../tools/create-item';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { estaTool } from '../tools/server';
import { readWatch, watchFactsTool, type WatchRead } from '../tools/watch-facts';
import type { JobContext, PreparedJob } from './registry';

export type WatchRequestInput = Omit<NoteBinding, 'sheet' | 'facts'> & { readonly timezone: string; read(): Promise<WatchRead> };

/**
 * The portfolio_watch request: watch_facts reads today's facts into the run's sheet, and create_item writes each note
 * through the number guard. The worker and the golden test build it here, so a recording hashes the prompt the worker
 * ships.
 */
export function portfolioWatchRequest(input: WatchRequestInput): PreparedJob {
  const { sheet, cite } = runSheet();
  const watch = watchFactsTool(input.read, input.locale, cite);
  const notes = watchNoteWriter({ ...input, sheet, facts: watch.facts });
  return {
    prompt: portfolioWatchPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone }),
    tools: new Map([estaTool('watch_facts', watch.run), estaTool('create_item', notes.write)]),
    async finish() {
      if (!watch.wasRead()) throw new Error('The model ended without reading watch_facts');
      const missed = [...watch.facts].filter(([handle, { fact }]) => fact.severity === 'action' && !notes.covered.has(handle));
      if (missed.length > 0) throw new Error(`The model left action facts without a note: ${missed.map(([handle, { fact }]) => `${handle} (${fact.ruleId})`).join(', ')}`);
      return { as_of: input.asOf, facts: watch.facts.size, notes: [...notes.written] };
    },
  };
}

export async function preparePortfolioWatch({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const asOf: IsoDate = (await clock()).today();
  const locale: Locale = await householdLocale(db, job.household_id);
  return portfolioWatchRequest({ db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, clock, read: readWatch(db, job.household_id, asOf, timezone) });
}
