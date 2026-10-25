import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AskReads } from '../../src/tools/ask-reads';

export const ASK_READS_FIXTURE = join(import.meta.dirname, 'ask-reads-full-2026-10-07.json');
/** What the reads answered during the live open-prose guard probe (`pnpm agent:guard-probe`), for its replay set. */
export const OPEN_PROSE_READS = join(import.meta.dirname, 'open-prose-reads-full-2026-10-07.json');

export type RecordedReads = Record<string, unknown>;

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
export function replayedReads(recorded: RecordedReads = JSON.parse(readFileSync(ASK_READS_FIXTURE, 'utf8')) as RecordedReads): AskReads {
  const answer =
    <A extends unknown[], T>(read: keyof AskReads) =>
    async (...args: A): Promise<T> => {
      const name = key(read, args);
      if (!Object.hasOwn(recorded, name)) throw new Error(`The ask reads fixture holds no ${name}; run pnpm --filter @esta/agent golden:ask-fixture`);
      return recorded[name] as T;
    };
  return { report: answer('report'), collections: answer('collections'), leases: answer('leases'), property: answer('property'), legal: answer('legal'), payments: answer('payments') };
}
