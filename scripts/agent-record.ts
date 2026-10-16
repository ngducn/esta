import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertStartAllowed, parseAgentEnv } from '../apps/agent/src/env.ts';
import { JOBS } from '../apps/agent/src/jobs/registry.ts';
import { canonicalizer, inputHash } from '../apps/agent/src/replay/canonicalize.ts';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../apps/agent/src/replay/store.ts';
import { judgeResult } from '../apps/agent/src/sdk/result.ts';
import { canonicalInput, liveSession } from '../apps/agent/src/sdk/session.ts';
import { serviceClient } from '../apps/agent/src/supabase.ts';
import { buildTools } from '../apps/agent/src/tools/server.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

// Runs the ping case live for `Gia đình Demo` on the slot's seeded stack and rewrites its recording (AGENT.md §8).
const slot = parseSlot(process.env.ESTA_SLOT);
const env = parseAgentEnv({ ...slotEnv(join(import.meta.dirname, '..'), slot, { app: 'agent' }), ESTA_AGENT_MODE: 'live' });
const mode = assertStartAllowed(env);
if (mode.agentMode !== 'live') throw new Error('agent:record runs live only');

const db = serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, 'recorder');
const householdId = seedId('seed:household:demo');
const { data: household, error } = await db.from('households').select('name').eq('id', householdId).single();
if (error) throw new Error(`Gia đình Demo is not seeded on slot ${slot}; run pnpm db:reset first (${error.message})`);

const spec = JOBS.ping;
const canon = canonicalizer({ householdName: household.name });
const prompt = spec.handler.prompt();
const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-record-job-')));
const configDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-record-config-')));
try {
  const run = await liveSession(
    { spec, prompt, jobDir, configDir, tools: buildTools(db, householdId, spec.mcpTools), canon },
    mode,
  );
  const outcome = judgeResult(run.result);
  if (!outcome.ok) throw new Error(`The live ping failed with ${outcome.failure.kind}: ${outcome.failure.message}`);
  const reply = canon.canonical(outcome.reply);
  if (!reply.includes('<household>')) throw new Error(`The reply does not name the household, so it would replay wrong: ${outcome.reply}`);

  const input = canonicalInput({ spec, prompt, canon });
  const kindDir = join(DEFAULT_REPLAY_DIR, spec.kind);
  mkdirSync(kindDir, { recursive: true });
  for (const file of readdirSync(kindDir, { withFileTypes: true }).filter((entry) => entry.name.endsWith('.json'))) {
    rmSync(join(kindDir, file.name));
  }
  const path = writeRecording(DEFAULT_REPLAY_DIR, {
    version: 1,
    kind: spec.kind,
    inputHash: inputHash(input),
    input,
    model: run.model,
    numTurns: run.result.numTurns,
    toolCalls: run.toolCalls.map((call) => ({ name: call.name, input: JSON.parse(canon.canonical(JSON.stringify(call.input))) })),
    reply,
  });
  console.log(`Recorded ${path}`);
  console.log(
    `model=${run.model} turns=${run.result.numTurns} cost_usd=${run.result.costUsd} tool_calls=${run.toolCalls.map((call) => call.name).join(',')}`,
  );
} finally {
  rmSync(jobDir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
}
