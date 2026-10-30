import type { IsoDate } from '@esta/core/date';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AskReads } from '../../src/tools/ask-reads';

/**
 * What the reads answered on the `full` seed, for the hand-written ask cases (`golden:ask-fixture`) and the live
 * open-prose guard probe (`pnpm agent:guard-probe`) alike. Each writer adds its answers to the ones already here.
 */
export const ASK_READS_FIXTURE = join(import.meta.dirname, 'ask-reads-full-2026-10-07.json');

export type RecordedReads = Record<string, unknown>;

export const recordedReads = (): RecordedReads => JSON.parse(readFileSync(ASK_READS_FIXTURE, 'utf8')) as RecordedReads;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The answers as a run on `asOf` reads them: the seed's figures are the same that week, so only an answer's own date moves. */
export const readsOn = (recorded: RecordedReads, asOf: IsoDate): RecordedReads =>
  Object.fromEntries(Object.entries(recorded).map(([name, answer]) => [name, isRecord(answer) && 'asOf' in answer ? { ...answer, asOf } : answer]));

const key = (read: keyof AskReads, args: readonly unknown[]) => `${read}${JSON.stringify(args)}`;

/** The reads, each answer kept under its read's name and arguments, so the golden replays what the seed's database answered. */
export function recordingReads(reads: AskReads, recorded: RecordedReads): AskReads {
  const kept =
    <A extends unknown[], T>(read: keyof AskReads, run: (...args: A) => Promise<T>) =>
    async (...args: A) => {
      const answer = await run(...args);
      recorded[key(read, args)] = answer;
      return answer;
    };
  return {
    report: kept('report', reads.report),
    collections: kept('collections', reads.collections),
    leases: kept('leases', reads.leases),
    property: kept('property', reads.property),
    legal: kept('legal', reads.legal),
    payments: kept('payments', reads.payments),
  };
}

/** Reads answered from a recording; a read it does not hold fails, so a changed tool shows up as a missing answer. */
export function replayedReads(recorded: RecordedReads = recordedReads()): AskReads {
  const answer =
    <A extends unknown[], T>(read: keyof AskReads) =>
    async (...args: A): Promise<T> => {
      const name = key(read, args);
      if (!Object.hasOwn(recorded, name)) throw new Error(`The ask reads fixture holds no ${name}; run pnpm --filter @esta/agent golden:ask-fixture`);
      return recorded[name] as T;
    };
  return { report: answer('report'), collections: answer('collections'), leases: answer('leases'), property: answer('property'), legal: answer('legal'), payments: answer('payments') };
}

/** The ask reads module for `vi.mock`: the real one, with `askReads` answering from the recording as a run on `asOf` reads it. */
export const askReadsOn = async (original: () => Promise<object>, asOf: IsoDate) => ({ ...(await original()), askReads: () => replayedReads(readsOn(recordedReads(), asOf)) });
