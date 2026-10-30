import type { McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOBS } from '../jobs/registry';
import { canonicalizer, inputHash } from '../replay/canonicalize';
import { writeRecording } from '../replay/store';
import { estaTool, mcpToolName, ToolRejection } from '../tools/server';
import { canonicalInput, liveSession, pruneTranscripts, replaySession, SessionGoneError, type SessionRequest } from './session';

const answersToModel: { isError: boolean; text: string }[] = [];

/**
 * Stands in for the model: it calls save_extraction once through the in-process server, keeps the answer it reads,
 * then ends the way the SDK does, with a result, or by throwing once the session was aborted.
 */
async function* modelThatSavesOnce({ options }: { options: Options }) {
  const server = options.mcpServers?.esta as McpSdkServerConfigWithInstance;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: 'model', version: '1.0.0' });
  await client.connect(clientSide);
  const answer = await client.callTool({ name: 'save_extraction', arguments: { result: {} } });
  answersToModel.push({ isError: answer.isError === true, text: JSON.stringify(answer.content) });
  await client.close();
  if (options.abortController?.signal.aborted === true) throw new Error('Claude Code process aborted by user');
  yield { type: 'result', subtype: 'success', is_error: false, result: 'Saved.', num_turns: 2, session_id: 's1', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] };
}

const RESUMED = '6f1d2c3b-1111-4222-8333-944455556666';

/** What SDK 0.3.291 does when `resume` names a session its config dir does not hold: an error result, then a throw. */
async function* cliWithoutTheSession(message = `No conversation found with session ID: ${RESUMED}`) {
  yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [message], num_turns: 0, session_id: 'b7e0c1d2-0000-4000-8000-000000000001', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] };
  throw new Error(`Claude Code returned an error result: ${message}`);
}

let model: (input: { options: Options }) => AsyncGenerator<unknown> = modelThatSavesOnce;

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>()),
  query: (input: { options: Options }) => model(input),
}));

const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-session-')));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));
beforeEach(() => {
  answersToModel.length = 0;
  model = modelThatSavesOnce;
});

const live = { agentMode: 'live', authMode: 'api_key', credential: { name: 'ANTHROPIC_API_KEY', value: 'unused' }, model: 'claude-sonnet-5-5', deepModel: null } as const;

const requestSaving = (run: () => Promise<unknown>): SessionRequest => ({
  spec: JOBS.extract_document,
  prompt: 'Read the file.',
  jobDir,
  configDir: jobDir,
  tools: new Map([estaTool('save_extraction', run)]),
  canon: canonicalizer({ householdName: 'Gia đình Demo' }),
});

function replaySaving(run: () => Promise<unknown>) {
  const request = requestSaving(run);
  const input = canonicalInput(request);
  writeRecording(jobDir, { version: 1, kind: input.kind, inputHash: inputHash(input), input, model: live.model, numTurns: 2, toolCalls: [{ name: mcpToolName('save_extraction'), input: { result: {} } }], reply: 'Saved.' });
  return replaySession(request, jobDir);
}

const infrastructureErrors = [
  ['a database error', new Error('Writing the review item failed: permission denied for table agent_items')],
  ['a network error', new TypeError('fetch failed')],
  ['an error named ToolRejection that is not one', Object.assign(new Error('looks like a rejection'), { name: 'ToolRejection' })],
] as const;

describe('the tool error boundary (AGENT.md §9)', () => {
  it('hands a rejection to the model, which reads it and goes on', async () => {
    const run = await liveSession(requestSaving(() => Promise.reject(new ToolRejection('parcels.0.area_m2: Expected number'))), live);
    expect(answersToModel).toEqual([{ isError: true, text: JSON.stringify([{ type: 'text', text: 'parcels.0.area_m2: Expected number' }]) }]);
    expect(run.result.isError).toBe(false);
  });

  describe.each(infrastructureErrors)('%s inside a tool', (_, failure) => {
    it('fails the live session with it, and the model reads a failed call that names none of it', async () => {
      await expect(liveSession(requestSaving(() => Promise.reject(failure)), live)).rejects.toBe(failure);
      expect(answersToModel).toEqual([{ isError: true, text: expect.not.stringContaining(failure.message) }]);
    });

    it('fails the replay session with it instead of turning it into an answer', async () => {
      await expect(replaySaving(() => Promise.reject(failure))).rejects.toBe(failure);
    });
  });
});

describe('a turn that resumes a session', () => {
  const resuming = (): SessionRequest => ({ ...requestSaving(() => Promise.resolve()), spec: JOBS.ask, tools: new Map(), onText: () => Promise.resolve(), resume: { sessionId: RESUMED, afterInputHash: 'a'.repeat(64) } });

  it('live, says the session is gone when the CLI finds no conversation with its id', async () => {
    model = () => cliWithoutTheSession();
    await expect(liveSession(resuming(), live)).rejects.toBeInstanceOf(SessionGoneError);
  });

  it('live, keeps any other error result an ordinary failed session', async () => {
    model = () => cliWithoutTheSession('API Error: 529 Overloaded');
    const run = await liveSession(resuming(), live);
    expect(run.result).toMatchObject({ isError: true, text: 'API Error: 529 Overloaded' });
  });

  it('in replay, says the session is gone when its config dir does not hold it, before it looks for a recording', async () => {
    await expect(replaySession({ ...resuming(), configDir: join(jobDir, 'moved-away') }, jobDir)).rejects.toBeInstanceOf(SessionGoneError);
  });
});

describe('pruneTranscripts (#340)', () => {
  it("keeps the one session a conversation resumes, live or replayed, and leaves what is not a session's", () => {
    const configDir = mkdtempSync(join(tmpdir(), 'esta-prune-'));
    const project = join(configDir, 'projects', '-tmp-esta-agent-conversations-c1');
    const KEEP = 'b7e0c1d2-0000-4000-8000-000000000002';
    const OLD = 'b7e0c1d2-0000-4000-8000-000000000001';
    for (const dir of [join(project, OLD), join(project, KEEP), join(project, 'memory'), join(configDir, 'replay-sessions')]) mkdirSync(dir, { recursive: true });
    for (const file of [join(project, `${OLD}.jsonl`), join(project, `${KEEP}.jsonl`), join(configDir, 'replay-sessions', 'replay-0123456789abcdef.json'), join(configDir, 'replay-sessions', 'replay-fedcba9876543210.json')]) writeFileSync(file, '{}\n');
    pruneTranscripts(configDir, KEEP);
    expect(readdirSync(project).toSorted()).toEqual([KEEP, `${KEEP}.jsonl`, 'memory']);
    expect(readdirSync(join(configDir, 'replay-sessions'))).toEqual([]);
    pruneTranscripts(configDir, 'replay-fedcba9876543210');
    expect(readdirSync(project)).toEqual(['memory']);
    rmSync(configDir, { recursive: true, force: true });
  });
});

describe('pruneTranscripts stays inside the conversation it prunes (#340)', () => {
  const KEEP = 'b7e0c1d2-0000-4000-8000-000000000002';
  const OLD = 'b7e0c1d2-0000-4000-8000-000000000001';
  const OTHER = 'b7e0c1d2-0000-4000-8000-000000000003';
  const scratch: string[] = [];
  const folder = (prefix: string) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    scratch.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file where a project folder belongs as nothing to prune, and still prunes the real projects', () => {
    const configDir = folder('esta-prune-stray-');
    const project = join(configDir, 'projects', '-tmp-esta-agent-conversations-c1');
    mkdirSync(project, { recursive: true });
    writeFileSync(join(configDir, 'projects', 'stray.json'), '{}');
    for (const id of [OLD, KEEP]) writeFileSync(join(project, `${id}.jsonl`), '{}\n');
    expect(() => pruneTranscripts(configDir, KEEP)).not.toThrow();
    expect(readdirSync(project)).toEqual([`${KEEP}.jsonl`]);
    expect(existsSync(join(configDir, 'projects', 'stray.json'))).toBe(true);
  });

  it('follows no symlink, so nothing outside the conversation is deleted', () => {
    const configDir = folder('esta-prune-links-');
    const outside = folder('esta-prune-outside-');
    const outsideProject = join(outside, 'project');
    const outsideReplays = join(outside, 'replays');
    const outsideSession = join(outside, `${OTHER}`);
    for (const dir of [outsideProject, outsideReplays, outsideSession]) mkdirSync(dir, { recursive: true });
    const kept = [join(outsideProject, `${OLD}.jsonl`), join(outsideReplays, 'replay-0123456789abcdef.json'), join(outsideSession, 'tool-result.txt'), join(outside, `${OLD}.jsonl`)];
    for (const file of kept) writeFileSync(file, '{}\n');

    const projects = join(configDir, 'projects');
    const real = join(projects, '-tmp-esta-agent-conversations-c1');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, `${OLD}.jsonl`), '{}\n');
    symlinkSync(outsideProject, join(projects, 'linked-project'));
    symlinkSync(join(outside, `${OLD}.jsonl`), join(real, 'b7e0c1d2-0000-4000-8000-000000000004.jsonl'));
    symlinkSync(outsideSession, join(real, OTHER));
    symlinkSync(outsideReplays, join(configDir, 'replay-sessions'));

    pruneTranscripts(configDir, KEEP);

    expect(kept.filter((file) => !existsSync(file))).toEqual([]);
    expect(existsSync(join(real, `${OLD}.jsonl`)), 'the conversation\'s own old transcript is still pruned').toBe(false);
  });

  it('prunes a configDir whose path crosses a symlink, as the temp dir of a Mac does', () => {
    const parent = folder('esta-prune-parent-');
    const real = join(parent, 'real');
    mkdirSync(join(real, 'config', 'replay-sessions'), { recursive: true });
    writeFileSync(join(real, 'config', 'replay-sessions', 'replay-0123456789abcdef.json'), '{}\n');
    symlinkSync(real, join(parent, 'alias'));
    pruneTranscripts(join(parent, 'alias', 'config'), KEEP);
    expect(readdirSync(join(real, 'config', 'replay-sessions'))).toEqual([]);
  });
});
