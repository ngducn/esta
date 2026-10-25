import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isoDate } from '../packages/core/src/date/iso-date.ts';
import { OPEN_PROSE, type OpenProsePrompt } from '../packages/core/src/guard/fixtures/open-prose.ts';
import { assertStartAllowed, parseAgentEnv, type RunMode } from '../apps/agent/src/env.ts';
import { askRequest } from '../apps/agent/src/jobs/ask.ts';
import { JOBS } from '../apps/agent/src/jobs/registry.ts';
import { canonicalizer, inputHash } from '../apps/agent/src/replay/canonicalize.ts';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../apps/agent/src/replay/store.ts';
import { judgeResult } from '../apps/agent/src/sdk/result.ts';
import { canonicalInput, liveSession, type SessionRequest } from '../apps/agent/src/sdk/session.ts';
import { serviceClient } from '../apps/agent/src/supabase.ts';
import { fakeDb } from '../apps/agent/src/test/fake-db.ts';
import { askReads } from '../apps/agent/src/tools/ask-reads.ts';
import { ANSWER, askRpcs, askTables, CONVERSATION, QUESTION } from '../apps/agent/test/ask-seed.ts';
import { clockOn, HOUSEHOLD } from '../apps/agent/test/full-seed.ts';
import { ASK_CONTEXT, rejectedTexts } from '../apps/agent/test/golden/ask-cases.ts';
import { OPEN_PROSE_READS, recordingReads, type RecordedReads } from '../apps/agent/test/golden/ask-reads.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

/**
 * Sends the open-prose prompts through `ask` live once on the slot's `full` seed (P5-12), records each turn as the
 * fixed replay set, and prints per prompt whether the first pass was rejected, by which text, whether the repair passed,
 * and whether the answer ended in `error`. A spike under CLAUDE.md: never in CI, never against production.
 */
type LiveMode = Extract<RunMode, { agentMode: 'live' }>;

type ProbeRow = {
  readonly id: string;
  readonly firstPass: 'passed' | 'rejected';
  readonly rejectedBy: readonly string[];
  readonly repair: 'passed' | 'rejected' | null;
  readonly status: 'done' | 'error';
  readonly model: string;
};

const { values } = parseArgs({ options: { only: { type: 'string' }, out: { type: 'string' }, concurrency: { type: 'string', default: '3' } } });
const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);

function liveMode(): { mode: LiveMode; env: ReturnType<typeof parseAgentEnv> } {
  const env = parseAgentEnv({ ...slotEnv(root, slot, { app: 'agent' }), ESTA_AGENT_MODE: 'live' });
  if (env.ESTA_ENV === 'production') throw new Error('agent:guard-probe refuses ESTA_ENV=production');
  const mode = assertStartAllowed(env);
  if (mode.agentMode !== 'live') throw new Error('agent:guard-probe runs live only');
  if (/fable/iu.test(mode.model)) throw new Error(`Refusing to probe with ESTA_MODEL_ROUTINE=${mode.model}, a Fable model`);
  return { mode, env };
}

async function probe(item: OpenProsePrompt, mode: LiveMode, reads: ReturnType<typeof askReads>): Promise<ProbeRow> {
  const tables = askTables(item.question);
  const db = fakeDb(tables, [], {}, {}, askRpcs(tables));
  const asOf = isoDate('2026-10-07');
  const prepared = askRequest({ db, householdId: HOUSEHOLD, jobId: `guard-probe-${item.id}`, conversationId: CONVERSATION, questionId: QUESTION, answerId: ANSWER, locale: 'vi', asOf, timezone: ASK_CONTEXT.timezone, question: item.question, earlier: null, seed: [], deep: false, reads, clock: clockOn('2026-10-07T07:00:00+07:00') });
  const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-probe-job-')));
  const configDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-probe-config-')));
  const canon = canonicalizer({ householdName: 'Gia đình Demo', jobDir });
  // The recording keeps the text the turn streamed, which the guard read, and not only the SDK's final message: text the
  // model wrote before its tool calls streams too.
  let streamed = '';
  const onText = async (delta: string) => {
    streamed += delta;
    await prepared.onText?.(delta);
  };
  const request: SessionRequest = { spec: JOBS.ask, prompt: prepared.prompt, jobDir, configDir, tools: prepared.tools, canon, onText };
  const passes: Array<'passed' | 'rejected'> = [];
  let rejectedBy: string[] = [];
  let model = '';
  try {
    let turn = request;
    for (;;) {
      const started = performance.now();
      streamed = '';
      const run = await liveSession(turn, mode);
      const outcome = judgeResult(run.result);
      if (!outcome.ok) throw new Error(`${item.id} failed live with ${outcome.failure.kind}: ${outcome.failure.message}`);
      model = run.model;
      const input = canonicalInput(turn);
      writeRecording(DEFAULT_REPLAY_DIR, {
        version: 1,
        kind: 'ask',
        inputHash: inputHash(input),
        input,
        label: `Live guard probe ${item.id}${passes.length === 0 ? '' : ', repair turn'} on the full seed at 2026-10-07 07:00 (P5-12).`,
        model: run.model,
        numTurns: run.result.numTurns,
        wallMs: Math.round(performance.now() - started),
        toolCalls: run.toolCalls.map((call) => ({ name: call.name, input: JSON.parse(canon.canonical(JSON.stringify(call.input))) as Record<string, unknown> })),
        reply: canon.canonical(streamed === '' ? outcome.reply : streamed),
      });
      const repair = await prepared.nextTurn?.().catch(() => 'rejected again');
      if (repair === null || repair === undefined) {
        passes.push('passed');
        await prepared.finish({ reply: outcome.reply, model: run.model, sessionId: run.result.sessionId, turnHash: inputHash(input) });
        return { id: item.id, firstPass: passes[0] ?? 'passed', rejectedBy, repair: passes[1] ?? null, status: 'done', model };
      }
      passes.push('rejected');
      if (repair === 'rejected again') return { id: item.id, firstPass: 'rejected', rejectedBy, repair: 'rejected', status: 'error', model };
      if (passes.length === 1) rejectedBy = rejectedTexts(repair);
      turn = { ...request, prompt: repair, resume: { sessionId: run.result.sessionId, afterInputHash: inputHash(input) } };
    }
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function main() {
  const { mode, env } = liveMode();
  const db = serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, 'guard-probe');
  const recorded: RecordedReads = existsSync(OPEN_PROSE_READS) ? (JSON.parse(readFileSync(OPEN_PROSE_READS, 'utf8')) as RecordedReads) : {};
  const reads = recordingReads(askReads(db, HOUSEHOLD, { locale: 'vi', asOf: ASK_CONTEXT.today }), recorded);
  const only = values.only?.split(',');
  const queue = OPEN_PROSE.filter((item) => only === undefined || only.includes(item.id));
  const rows: ProbeRow[] = [];
  const failures: string[] = [];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      try {
        const row = await probe(item, mode, reads);
        rows.push(row);
        console.log(JSON.stringify(row));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
  writeFileSync(OPEN_PROSE_READS, `${JSON.stringify(recorded, null, 2)}\n`);
  const count = (pick: (row: ProbeRow) => boolean) => rows.filter(pick).length;
  const summary = { prompts: rows.length, firstPassRejected: count((row) => row.firstPass === 'rejected'), repairRejected: count((row) => row.repair === 'rejected'), error: count((row) => row.status === 'error') };
  console.log(JSON.stringify(summary));
  if (values.out !== undefined) writeFileSync(values.out, `${JSON.stringify({ summary, rows: rows.toSorted((a, b) => a.id.localeCompare(b.id)) }, null, 2)}\n`);
  if (failures.length > 0) throw new Error(`Not probed:\n${failures.join('\n')}`);
}

await main();
