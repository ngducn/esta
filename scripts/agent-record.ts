import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { assertStartAllowed, parseAgentEnv, type RunMode } from '../apps/agent/src/env.ts';
import { withExtractSession } from '../apps/agent/src/jobs/extract-session.ts';
import { PING_PROMPT, pingTools } from '../apps/agent/src/jobs/ping.ts';
import { JOBS } from '../apps/agent/src/jobs/registry.ts';
import { canonicalizer, inputHash } from '../apps/agent/src/replay/canonicalize.ts';
import { DEFAULT_REPLAY_DIR, writeRecording, type Recording } from '../apps/agent/src/replay/store.ts';
import { judgeResult } from '../apps/agent/src/sdk/result.ts';
import { canonicalInput, liveSession } from '../apps/agent/src/sdk/session.ts';
import { serviceClient } from '../apps/agent/src/supabase.ts';
import { CRAFTED, extractionFixtures, type CraftedId, type ExtractionFixture } from '../fixtures/certificates/generator/uploads.tsx';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

type LiveMode = Extract<RunMode, { agentMode: 'live' }>;

const { values } = parseArgs({ options: { kind: { type: 'string', default: 'ping' }, only: { type: 'string' }, concurrency: { type: 'string', default: '4' } } });
const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);

function liveMode(env: ReturnType<typeof parseAgentEnv>): LiveMode {
  const mode = assertStartAllowed(env);
  if (mode.agentMode !== 'live') throw new Error('agent:record runs live only');
  if (/fable/iu.test(mode.model)) throw new Error(`Refusing to record with ESTA_MODEL_ROUTINE=${mode.model}, a Fable model`);
  return mode;
}

function tempDirs() {
  return { jobDir: realpathSync(mkdtempSync(join(tmpdir(), 'esta-record-job-'))), configDir: realpathSync(mkdtempSync(join(tmpdir(), 'esta-record-config-'))) };
}

function clearKind(kind: string, keep: ReadonlySet<string> = new Set()) {
  const kindDir = join(DEFAULT_REPLAY_DIR, kind);
  mkdirSync(kindDir, { recursive: true });
  for (const file of readdirSync(kindDir).filter((name) => name.endsWith('.json') && !keep.has(name))) rmSync(join(kindDir, file));
}

async function recordPing(): Promise<void> {
  const env = parseAgentEnv({ ...slotEnv(root, slot, { app: 'agent' }), ESTA_AGENT_MODE: 'live' });
  const mode = liveMode(env);
  const db = serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, 'recorder');
  const householdId = seedId('seed:household:demo');
  const { data: household, error } = await db.from('households').select('name').eq('id', householdId).single();
  if (error) throw new Error(`Gia đình Demo is not seeded on slot ${slot}; run pnpm db:reset first (${error.message})`);

  const spec = JOBS.ping;
  const canon = canonicalizer({ householdName: household.name });
  const { jobDir, configDir } = tempDirs();
  try {
    const run = await liveSession({ spec, prompt: PING_PROMPT, jobDir, configDir, tools: pingTools(db, householdId), canon }, mode);
    const outcome = judgeResult(run.result);
    if (!outcome.ok) throw new Error(`The live ping failed with ${outcome.failure.kind}: ${outcome.failure.message}`);
    const reply = canon.canonical(outcome.reply);
    if (!reply.includes('<household>')) throw new Error(`The reply does not name the household, so it would replay wrong: ${outcome.reply}`);
    const input = canonicalInput({ spec, prompt: PING_PROMPT, canon });
    clearKind(spec.kind);
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
    console.log(`model=${run.model} turns=${run.result.numTurns} cost_usd=${run.result.costUsd} tool_calls=${run.toolCalls.map((call) => call.name).join(',')}`);
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function recordFixture(fixture: ExtractionFixture, mode: LiveMode): Promise<Recording> {
  return withExtractSession(fixture.schemaName, await fixture.upload(), async ({ request, saved }) => {
    const started = performance.now();
    const run = await liveSession(request, mode);
    const wallMs = Math.round(performance.now() - started);
    const outcome = judgeResult(run.result);
    if (!outcome.ok || saved() === null) throw new Error(`${fixture.id} saved no valid extraction: ${outcome.ok ? outcome.reply : outcome.failure.message}`);
    const input = canonicalInput(request);
    const toolCalls = run.toolCalls.map((call) => ({ name: call.name, input: JSON.parse(request.canon.canonical(JSON.stringify(call.input))) as Record<string, unknown> }));
    for (const call of toolCalls) {
      const path = call.input.file_path;
      if (typeof path === 'string' && !path.startsWith('<jobdir>/')) throw new Error(`${fixture.id} read ${path}, which would not replay in another job directory`);
    }
    const recording = { version: 1 as const, kind: 'extract_document', inputHash: inputHash(input), input, label: fixture.id, model: run.model, numTurns: run.result.numTurns, wallMs, toolCalls, reply: request.canon.canonical(outcome.reply) };
    console.log(`${fixture.id} turns=${run.result.numTurns} wall_s=${(wallMs / 1000).toFixed(1)} cost_usd=${run.result.costUsd.toFixed(4)} calls=${toolCalls.map((call) => call.name).join(',')}`);
    return recording;
  });
}

const AREA_IN_WORDS = 'khoảng sáu mươi tám mét vuông';

function saveCalls(recording: Recording) {
  return recording.toolCalls.filter((call) => call.name.endsWith('save_extraction'));
}

/** Rewrites a live recording into one that scripts a failure path; every rewrite is plain data a reviewer can read. */
const CRAFTS: Record<CraftedId, (base: Recording) => Pick<Recording, 'toolCalls' | 'numTurns' | 'reply'>> = {
  'repair-invalid-area': (base) => {
    const [save] = saveCalls(base);
    const result = structuredClone(save?.input.result) as { parcels: { area_m2: { value: unknown } }[] };
    const [parcel] = result.parcels;
    if (parcel !== undefined) parcel.area_m2.value = AREA_IN_WORDS;
    const reads = base.toolCalls.filter((call) => call.name === 'Read');
    return { toolCalls: [...reads, { name: save?.name ?? '', input: { result } }, ...saveCalls(base)], numTurns: base.numTurns + 1, reply: base.reply };
  },
  'deny-outside-read': (base) => ({ toolCalls: [{ name: 'Read', input: { file_path: '/etc/hosts' } }, ...base.toolCalls], numTurns: base.numTurns + 1, reply: base.reply }),
  'blank-page': () => {
    const empty = { name: 'mcp__esta__save_extraction', input: { result: { form: null } } };
    return { toolCalls: [{ name: 'Read', input: { file_path: '<jobdir>/document.jpg' } }, empty, empty, empty], numTurns: 5, reply: 'Không đọc được tài liệu này: trang trống.' };
  },
};

async function craft(id: CraftedId, recordings: ReadonlyMap<string, Recording>): Promise<Recording> {
  const crafted = CRAFTED[id];
  const base = recordings.get(crafted.base);
  if (base === undefined) throw new Error(`${id} needs the ${crafted.base} recording`);
  const input = await withExtractSession('certificate_v1', await crafted.upload(), async ({ request }) => canonicalInput(request));
  return { version: 1, kind: 'extract_document', inputHash: inputHash(input), input, label: `crafted ${id} from ${crafted.base}`, model: base.model, ...CRAFTS[id](base) };
}

async function recordExtractions(): Promise<void> {
  const env = parseAgentEnv({ ...slotEnv(root, slot, { withKeys: false, app: 'agent' }), SUPABASE_SERVICE_ROLE_KEY: 'unused-by-extract-recording', ESTA_AGENT_MODE: 'live' });
  const mode = liveMode(env);
  console.log(`auth=${mode.authMode} model=${mode.model}`);
  const only = values.only?.split(',');
  const fixtures = extractionFixtures().filter((fixture) => only === undefined || only.includes(fixture.id));
  const recordings = new Map<string, Recording>();
  for (const name of readdirSync(join(DEFAULT_REPLAY_DIR, 'extract_document'), { withFileTypes: true }).map((entry) => entry.name)) {
    const existing = JSON.parse(readFileSync(join(DEFAULT_REPLAY_DIR, 'extract_document', name), 'utf8')) as Recording;
    if (existing.label !== undefined) recordings.set(existing.label, existing);
  }
  const queue = [...fixtures];
  const failures: string[] = [];
  const worker = async () => {
    for (let fixture = queue.shift(); fixture !== undefined; fixture = queue.shift()) {
      try {
        recordings.set(fixture.id, await recordFixture(fixture, mode));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
  for (const id of Object.keys(CRAFTED) as CraftedId[]) recordings.set(`crafted ${id}`, await craft(id, recordings));
  const written = new Set<string>();
  for (const recording of recordings.values()) written.add(`${writeRecording(DEFAULT_REPLAY_DIR, recording).split('/').at(-1)}`);
  clearKind('extract_document', written);
  console.log(`live calls=${fixtures.length} recordings=${written.size}`);
  if (failures.length > 0) throw new Error(`Not recorded:\n${failures.join('\n')}`);
}

if (values.kind === 'ping') await recordPing();
else if (values.kind === 'extract_document') await recordExtractions();
else throw new Error(`agent:record knows --kind ping or extract_document, not ${values.kind}`);
