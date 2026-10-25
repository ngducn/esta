import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readClock } from '../packages/ops/src/clock.ts';
import { parseAgentEnv } from '../apps/agent/src/env.ts';
import { proposalWriter } from '../apps/agent/src/tools/create-proposal.ts';
import { runSheet } from '../apps/agent/src/tools/fact-sheet.ts';
import { householdLocale } from '../apps/agent/src/tools/household-info.ts';
import { listPropertiesTool } from '../apps/agent/src/tools/list-properties.ts';
import { ToolRejection } from '../apps/agent/src/tools/server.ts';
import { readWatch, watchFactsTool } from '../apps/agent/src/tools/watch-facts.ts';
import { serviceClient } from '../apps/agent/src/supabase.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const USAGE = 'Usage: pnpm agent:propose --household <seed key> --type <type> --params <file with {"params", "rationale"}>';

/** Lanes seed proposals on local stacks only; a production database takes proposals from the assistant's own runs. */
export function refuseProduction(estaEnv: string | undefined): string | null {
  return estaEnv === 'production' ? 'Refusing to run agent:propose with ESTA_ENV=production' : null;
}

/** Each string `seed:…` in the fixture, with `{household}` filled in, becomes that seed key's id (supabase/seed/README.md). */
export function resolveSeedKeys(value: unknown, household: string): unknown {
  if (typeof value === 'string') return value.startsWith('seed:') ? seedId(value.replaceAll('{household}', household)) : value;
  if (Array.isArray(value)) return value.map((entry) => resolveSeedKeys(entry, household));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveSeedKeys(entry, household)]));
  return value;
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { household: { type: 'string' }, type: { type: 'string' }, params: { type: 'string' } } });
  if (values.household === undefined || values.type === undefined || values.params === undefined) {
    console.error(USAGE);
    return 2;
  }
  const env = parseAgentEnv({ ...slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { app: 'agent' }), ESTA_AGENT_MODE: 'replay' });
  const refusal = refuseProduction(env.ESTA_ENV) ?? refuseProduction(process.env.ESTA_ENV);
  if (refusal !== null) {
    console.error(refusal);
    return 1;
  }
  const fixture = resolveSeedKeys(JSON.parse(readFileSync(values.params, 'utf8')), values.household) as Record<string, unknown>;
  const db = serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, 'propose');
  const householdId = seedId(`seed:household:${values.household}`);
  const { data: household } = await db.from('households').select('id').eq('id', householdId).maybeSingle();
  if (household === null) {
    console.error(`No household has the seed key ${values.household}; lane keys read lane-1 to lane-10 (supabase/seed/README.md)`);
    return 2;
  }
  const clock = () => readClock(db, env);
  const now = await clock();

  // Stored as done from the start, so the worker never claims a kind it does not run.
  const { data: job, error } = await db
    .from('agent_jobs')
    .insert({ household_id: householdId, kind: 'propose', status: 'done', run_after: now.now(), started_at: now.now(), finished_at: now.now(), payload: { type: values.type } })
    .select('id')
    .single();
  if (error) throw new Error(`Starting the propose run failed for ${values.household}: ${error.message}`);

  const { sheet, cite } = runSheet();
  const locale = await householdLocale(db, householdId);
  await watchFactsTool(readWatch(db, householdId, now.today(), env.ESTA_TIMEZONE), locale, cite).run();
  await listPropertiesTool(db, householdId, cite).run();
  const writer = proposalWriter({ db, householdId, jobId: job.id, locale, sheet, clock });
  try {
    const saved = await writer.write({ type: values.type, params: fixture.params ?? {}, rationale: fixture.rationale ?? '' });
    await db.from('agent_jobs').update({ result: saved }).eq('id', job.id);
    console.log(saved.added ? `Proposed ${saved.dedupe_key}` : `Already proposed ${saved.dedupe_key}`);
    return 0;
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    await db.from('agent_jobs').update({ status: 'failed', error: message }).eq('id', job.id);
    console.error(failure instanceof ToolRejection ? `create_proposal refused it:\n${message}` : message);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main();
