import { isoDate } from '@esta/core/date';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '../../../../scripts/db-checksum.ts';
import { slotEnv } from '../../../../scripts/slot-env.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';
import { reviewedWeek, weeklyReviewRequest } from '../../src/jobs/weekly-review';
import { DEFAULT_REPLAY_DIR, recordingSchema } from '../../src/replay/store';
import { serviceClient } from '../../src/supabase';
import { askReads } from '../../src/tools/ask-reads';
import { runTool } from '../../src/tools/server';
import { clockOn } from '../full-seed';
import { ASK_READS_FIXTURE, recordedReads, readsOn, recordingReads, type RecordedReads } from './ask-reads';

export const WEEKLY_AS_OF = '2026-10-11T08:00:00+07:00';

export function weeklyRecording() {
  const dir = join(DEFAULT_REPLAY_DIR, 'weekly_review');
  const [file, ...more] = readdirSync(dir);
  if (file === undefined || more.length > 0) throw new Error(`${dir} should hold exactly one recording`);
  return recordingSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
}

async function main() {
  const root = join(import.meta.dirname, '../../../..');
  const slot = parseSlot(process.env.ESTA_SLOT);
  const env = slotEnv(root, slot, { app: 'agent' });
  const db = serviceClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', 'weekly-fixture');
  const [household] = query<{ id: string }>(slotWorkdir(root, slot), `select id::text from public.households where name = 'Gia đình Demo'`);
  if (household === undefined) throw new Error('The slot holds no Gia đình Demo; run pnpm db:reset');
  const { week, asOf } = reviewedWeek({ idempotency_key: null }, isoDate(WEEKLY_AS_OF.slice(0, 10)));
  const recorded: RecordedReads = {};
  const reads = recordingReads(askReads(db, household.id, { locale: 'vi', asOf }), recorded);
  const prepared = weeklyReviewRequest({ db, householdId: household.id, jobId: 'weekly-fixture', locale: 'vi', week, asOf, earlierProposals: 0, timezone: 'Asia/Ho_Chi_Minh', reads, clock: clockOn(WEEKLY_AS_OF) });
  for (const call of weeklyRecording().toolCalls.filter(({ name }) => !/create_(item|proposal)$/.test(name))) {
    const tool = prepared.tools.get(call.name);
    if (tool === undefined) continue;
    const { text, isError } = await runTool(tool, call.input);
    if (isError) throw new Error(`${call.name} refused ${JSON.stringify(call.input)}: ${text}`);
  }
  const shared = recordedReads();
  const sharedOnSunday = readsOn(shared, asOf);
  for (const [name, answer] of Object.entries(recorded)) {
    if (!Object.hasOwn(shared, name)) shared[name] = answer;
    else if (JSON.stringify(sharedOnSunday[name]) !== JSON.stringify(answer)) throw new Error(`The weekly review reads ${name} differently from ${ASK_READS_FIXTURE}; record both from one seed`);
  }
  writeFileSync(ASK_READS_FIXTURE, `${JSON.stringify(shared, null, 2)}\n`);
  console.log(`Wrote ${ASK_READS_FIXTURE}`);
}

if (import.meta.main) await main();
