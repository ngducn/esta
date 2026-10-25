import { isoDate } from '@esta/core/date';
import { readFileSync } from 'node:fs';
import { weeklyReviewRequest } from '../../src/jobs/weekly-review';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../../src/replay/store';
import { canonicalInput } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { replayedReads } from './ask-reads';

const asOf = isoDate('2026-10-11');
const prepared = weeklyReviewRequest({ db: fakeDb({}), householdId: HOUSEHOLD, jobId: 'x', locale: 'vi', asOf, timezone: 'Asia/Ho_Chi_Minh', reads: replayedReads({}), clock: clockOn('2026-10-11T08:00:00+07:00') });
const input = canonicalInput({ spec: JOBS.weekly_review, prompt: prepared.prompt, canon: canonicalizer({ householdName: 'Gia đình Demo' }) });
const toolCalls = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Array<{ name: string; input: Record<string, unknown> }>;
console.log(writeRecording(DEFAULT_REPLAY_DIR, {
  version: 1,
  kind: 'weekly_review',
  inputHash: inputHash(input),
  input,
  label: 'Hand-written for the full seed at 2026-10-11 08:00 (P5-08b); its rent change cites the Vành đai 3 item the 06:00 research scan of 2026-10-07 stores; the live recording waits for the P5-10 live run.',
  model: 'hand-written',
  numTurns: 14,
  toolCalls,
  reply: 'xong',
}));
