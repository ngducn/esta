import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_SOURCE_SENTENCE } from '@esta/core/assistant';
import { ASK_SESSIONS_PER_TURN } from '../../src/jobs/ask';
import { askPrompt, askSourceRepairPrompt } from '../../src/prompts/ask';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { writeRecording } from '../../src/replay/store';
import { canonicalInput } from '../../src/sdk/session';
import { JOBS } from '../../src/jobs/registry';
import { pollOnce } from '../../src/runner';
import { answerRow, askTables, askWorker, withSeedNames } from '../ask-seed';
import { ASK_CONTEXT, LEAK_CASE, LEAK_REPLAY_DIR } from '../golden/ask-cases';
import { OVER_CAP_CASE, OVER_CAP_REPAIR_CASE, OVER_CAP_REPLAY_DIR } from '../golden/ask-web-cases';
import { tempDirs } from '../job-dir';

const tempDir = tempDirs();

const TENANT = 'Hoàng Văn Em';

/** Every file under `dir`, read as text, so a name in a replayed transcript shows. */
const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [readFileSync(path, 'utf8')];
  });

describe('a search the guard denies leaves no trace of what it held', () => {
  it('the leak case stores one denied WebSearch and no row, run record or transcript holds the tenant name', async () => {
    const tables = withSeedNames(askTables(LEAK_CASE.question));
    const jobs = tempDir('esta-ask-web-jobs-');
    const { worker, writes } = askWorker(tables, jobs, LEAK_REPLAY_DIR);
    await pollOnce(worker);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'done', error: null });
    const runs = writes.filter(({ table }) => table === 'agent_runs');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.row.usage).toMatchObject({ permission_denials: [{ tool_name: 'WebSearch', code: 'family_data' }] });
    expect(runs[0]?.row.usage).not.toMatchObject({ permission_denials: [{ tool_input: expect.anything() }] });
    const stored = JSON.stringify([writes, answerRow(tables), tables.agent_runs ?? [], filesUnder(jobs)]);
    expect(stored).not.toContain(TENANT);
    expect(stored).not.toContain('Hoàng Văn');
  });
});

async function runCase(question: string, replayDir: string) {
  const tables = withSeedNames(askTables(question));
  const { worker, writes } = askWorker(tables, tempDir('esta-ask-web-jobs-'), replayDir);
  await pollOnce(worker);
  const run = writes.find(({ table }) => table === 'agent_runs')?.row;
  return { tables, run: run as { tool_calls: Record<string, number>; usage: { permission_denials: Array<{ tool_name: string; code: string }> } } };
}

describe('a turn searches at most four times, whatever sessions it takes', () => {
  it.each([
    ['one session makes the fifth search', OVER_CAP_CASE.question, '7,5%'],
    ['a repair session makes it, and opens a page the first session found', OVER_CAP_REPAIR_CASE.question, 'chưa tìm được nguồn chính thức'],
  ])('denies the fifth search, still answers and books four when %s', async (_, question, answer) => {
    const { tables, run } = await runCase(question, OVER_CAP_REPLAY_DIR);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'done', error: null });
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: expect.stringContaining(answer) });
    expect(run.usage.permission_denials).toMatchObject([{ tool_name: 'WebSearch', code: 'cap' }]);
    expect(run.tool_calls).toMatchObject({ WebSearch: 4, WebFetch: 1 });
  });
});

describe('a stuck ask is reclaimed only after a whole turn could have run', () => {
  it('waits for every session of the turn, then the claim\'s two minutes of grace', () => {
    const migrations = join(__dirname, '../../../../supabase/migrations');
    const newest = readdirSync(migrations)
      .filter((name) => readFileSync(join(migrations, name), 'utf8').includes("when 'ask' then interval"))
      .toSorted()
      .at(-1);
    const minutes = Number(/when 'ask' then interval '(\d+) minutes'/u.exec(readFileSync(join(migrations, newest ?? ''), 'utf8'))?.[1]);
    expect(minutes * 60_000).toBeGreaterThan(ASK_SESSIONS_PER_TURN * JOBS.ask.timeoutMs);
  });
});

describe('the no-source sentence follows the language of the reply', () => {
  it('answers an English legal question in a Vietnamese household in English', async () => {
    const question = 'What is the legal procedure to transfer a land title?';
    const dir = tempDir('esta-ask-web-replay-');
    const canon = canonicalizer({ householdName: 'Gia đình Demo' });
    let after: string | undefined;
    for (const [prompt, reply] of [
      [askPrompt({ ...ASK_CONTEXT, question }), 'I could not find a page for this.'],
      [askSourceRepairPrompt(), 'I still could not find an official page.'],
    ] as const) {
      const input = canonicalInput({ spec: JOBS.ask, prompt, canon, ...(after === undefined ? {} : { resume: { sessionId: null, afterInputHash: after } }) });
      writeRecording(dir, { version: 1, kind: 'ask', inputHash: inputHash(input), input, model: 'test', numTurns: 1, toolCalls: [], reply });
      after = inputHash(input);
    }
    const tables = askTables(question);
    const { worker } = askWorker(tables, tempDir('esta-ask-web-jobs-'), dir);
    await pollOnce(worker);
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: NO_SOURCE_SENTENCE.en });
  });
});
