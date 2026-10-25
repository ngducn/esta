import { isoDate } from '@esta/core/date';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '../../../../scripts/db-checksum.ts';
import { slotEnv } from '../../../../scripts/slot-env.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';
import { askRequest } from '../../src/jobs/ask';
import { serviceClient } from '../../src/supabase';
import { askReads } from '../../src/tools/ask-reads';
import { runTool } from '../../src/tools/server';
import { clockOn } from '../full-seed';
import { ASK_CASES, caseEarlier } from './ask-cases';
import { ASK_READS_FIXTURE, recordingReads, type RecordedReads } from './ask-reads';

export const ASK_FIXTURE = join(import.meta.dirname, 'ask-full-2026-10-07.json');

const DEMO = `(select id from public.households where name = 'Gia đình Demo')`;
const TABLES: Record<string, string> = {
  properties: `select id::text, household_id::text, code, nickname, kind, use_mode, legal_status, current_address, deleted_at from public.properties where household_id = ${DEMO} order by code`,
  admin_units: `select code, name from public.admin_units where code in (select current_address ->> k from public.properties, unnest(array['commune_code', 'province_code']) k where household_id = ${DEMO}) order by code`,
  allocation_facts: `select property_id::text, household_id::text, received_on::text, amount_vnd, payment_id::text, invoice_id::text from public.allocation_facts where household_id = ${DEMO} and received_on >= '2026-01-01' order by payment_id, invoice_id`,
  expenses: `select id::text, property_id::text, household_id::text, paid_on::text, category, amount_vnd, deleted_at from public.expenses where household_id = ${DEMO} and paid_on >= '2026-01-01' order by id`,
};

/**
 * Writes the two fixtures the ask golden reads from the slot's `full` seed: the rows list_properties and ledger query,
 * and what every other read tool's ops reads answer for the cases' tool calls.
 */
async function main() {
  const root = join(import.meta.dirname, '../../../..');
  const slot = parseSlot(process.env.ESTA_SLOT);
  const workdir = slotWorkdir(root, slot);
  writeFileSync(ASK_FIXTURE, `${JSON.stringify(Object.fromEntries(Object.entries(TABLES).map(([table, sql]) => [table, query(workdir, sql)])), null, 2)}\n`);

  const env = slotEnv(root, slot, { app: 'agent' });
  const db = serviceClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', 'ask-fixture');
  const [household] = query<{ id: string }>(workdir, `select id::text from public.households where name = 'Gia đình Demo'`);
  if (household === undefined) throw new Error('The slot holds no Gia đình Demo; run pnpm db:reset');
  const asOf = isoDate('2026-10-07');
  const recorded: RecordedReads = {};
  for (const askCase of ASK_CASES) {
    const prepared = askRequest({
      db,
      householdId: household.id,
      jobId: 'ask-fixture',
      answerId: 'ask-fixture',
      locale: 'vi',
      asOf,
      timezone: 'Asia/Ho_Chi_Minh',
      question: askCase.question,
      earlier: caseEarlier(askCase),
      deep: askCase.deep === true,
      reads: recordingReads(askReads(db, household.id, { locale: 'vi', asOf }), recorded),
      clock: clockOn('2026-10-07T07:00:00+07:00'),
    });
    for (const call of askCase.toolCalls) {
      const tool = prepared.tools.get(call.name);
      if (tool === undefined) throw new Error(`${askCase.id} calls ${call.name}, which ask does not offer`);
      const { text, isError } = await runTool(tool, call.input);
      if (isError) throw new Error(`${askCase.id}: ${call.name} refused ${JSON.stringify(call.input)}: ${text}`);
      if (process.env.ESTA_SHOW_TOOLS === '1') console.log(`${askCase.id} ${call.name} ${text}`);
    }
  }
  writeFileSync(ASK_READS_FIXTURE, `${JSON.stringify(recorded, null, 2)}\n`);
  console.log(`Wrote ${ASK_FIXTURE} and ${ASK_READS_FIXTURE}`);
}

if (import.meta.main) await main();
