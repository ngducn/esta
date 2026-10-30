import { query, type HookCallback, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Json } from '@esta/db';
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { RunMode } from '../env';
import type { JobSpec, ModelRole } from '../jobs/registry';
import { InvalidJobError } from '../jobs/extract-document';
import { inputHash, type CanonicalInput, type Canonicalizer } from '../replay/canonicalize';
import { readRecording, recordingPath } from '../replay/store';
import { estaServer, runTool, type EstaTools } from '../tools/server';
import { buildSdkEnv, buildSdkOptions } from './options';
import { decideToolUse, pathPolicyHook, rememberSearchHits, toolCaps, type ToolPolicy } from './path-policy';
import { fromSdkResult, type SessionResult } from './result';

export type ToolCall = { readonly name: string; readonly input: Record<string, unknown> };

export type BuiltInResult = ToolCall & { readonly result: unknown };

export class SessionGoneError extends Error {
  constructor(sessionId: string) {
    super(`The session ${sessionId} this turn resumes is gone`);
    this.name = 'SessionGoneError';
  }
}

const SESSION_GONE = 'No conversation found with session ID';

export type SessionRun = { readonly result: SessionResult; readonly model: string; readonly toolCalls: readonly ToolCall[] };

export type SessionRequest = {
  readonly spec: JobSpec;
  readonly prompt: string;
  readonly jobDir: string;
  readonly configDir: string;
  readonly tools: EstaTools;
  readonly canon: Canonicalizer;
  readonly caps?: Readonly<Record<string, number>>;
  observe?(call: BuiltInResult): void;
  onText?(delta: string): Promise<void>;
  readonly resume?: { readonly sessionId: string | null; readonly afterInputHash: string };
  readonly modelRole?: ModelRole;
};

const keepsTranscript = (request: SessionRequest) => request.onText !== undefined;

export function canonicalInput({ spec, prompt, canon, resume, modelRole }: Pick<SessionRequest, 'spec' | 'prompt' | 'canon' | 'resume' | 'modelRole'>): CanonicalInput {
  return {
    ...(resume === undefined ? {} : { resumesInputHash: resume.afterInputHash }),
    ...(modelRole === undefined || modelRole === spec.modelRole ? {} : { modelRole }),
    version: 1,
    kind: spec.kind,
    prompt: canon.canonical(prompt),
    builtInTools: [...spec.builtInTools],
    mcpTools: [...spec.mcpTools],
    maxTurns: spec.maxTurns,
  };
}

function toolPolicy({ spec, jobDir, tools, caps }: SessionRequest): ToolPolicy {
  return {
    allowed: new Set([...spec.builtInTools, ...tools.keys()]),
    jobDir,
    ...(caps === undefined ? {} : { caps: toolCaps(caps) }),
    ...(spec.builtInTools.includes('WebFetch') ? { fetchable: new Set<string>() } : {}),
  };
}

function observeBuiltIn(request: SessionRequest, policy: ToolPolicy, call: BuiltInResult): void {
  rememberSearchHits(policy, call.name, call.result);
  request.observe?.(call);
}

/** The SDK runs PostToolUse only for a call that succeeded. */
function observeHook(request: SessionRequest, policy: ToolPolicy): HookCallback {
  return async (input) => {
    if (input.hook_event_name === 'PostToolUse' && !request.tools.has(input.tool_name)) {
      const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? (input.tool_input as Record<string, unknown>) : {};
      observeBuiltIn(request, policy, { name: input.tool_name, input: toolInput, result: input.tool_response });
    }
    return {};
  };
}

function liveModel(request: SessionRequest, mode: Extract<RunMode, { agentMode: 'live' }>): string {
  if ((request.modelRole ?? request.spec.modelRole) === 'routine') return mode.model;
  if (mode.deepModel === null) throw new InvalidJobError(`${request.spec.kind} asks for the deep model, and ESTA_MODEL_DEEP is not set`);
  return mode.deepModel;
}

export async function liveSession(request: SessionRequest, mode: Extract<RunMode, { agentMode: 'live' }>): Promise<SessionRun> {
  const model = liveModel(request, mode);
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), request.spec.timeoutMs);
  const toolFailures: unknown[] = [];
  const policy = toolPolicy(request);
  const options = buildSdkOptions({
    spec: request.spec,
    jobDir: request.jobDir,
    model,
    env: buildSdkEnv({ credential: mode.credential, configDir: request.configDir, path: process.env.PATH ?? '/usr/bin:/bin' }),
    server: estaServer(request.tools, (error) => {
      toolFailures.push(error);
      abortController.abort();
    }),
    preToolUse: pathPolicyHook(policy, (toolName, reason) => console.warn(`[agent] denied ${toolName}: ${reason}`)),
    postToolUse: observeHook(request, policy),
    abortController,
    ...(keepsTranscript(request) ? { streaming: { resume: request.resume?.sessionId ?? null } } : {}),
  });
  const toolCalls: ToolCall[] = [];
  let result: SDKResultMessage | undefined;
  let cause: string | null = null;
  let streamed = false;
  try {
    for await (const message of query({ prompt: request.prompt, options })) {
      if (message.type === 'stream_event' && request.onText !== undefined) {
        const { event } = message;
        // Text the model writes before and after a tool call arrives as separate blocks; a blank line keeps them paragraphs.
        if (event.type === 'content_block_start' && event.content_block.type === 'text' && streamed) await request.onText('\n\n');
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          streamed = true;
          await request.onText(event.delta.text);
        }
      } else if (message.type === 'rate_limit_event') {
        if (message.rate_limit_info.status === 'rejected') cause = 'rate_limit';
      } else if (message.type === 'assistant') {
        cause = message.error ?? cause;
        for (const block of message.message.content) {
          if (block.type === 'tool_use') toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
        }
      } else if (message.type === 'result') {
        result = message;
      }
    }
  } catch (error) {
    // The SDK throws after it has yielded an error result, or once a tool failure aborted it; either already says what failed.
    if (result === undefined && toolFailures.length === 0) throw error;
  } finally {
    clearTimeout(timer);
  }
  if (toolFailures.length > 0) throw toolFailures[0];
  if (result === undefined) throw new Error('The model session ended without a result');
  const resumed = request.resume?.sessionId ?? null;
  if (resumed !== null && result.subtype === 'error_during_execution' && result.errors.some((error) => error.startsWith(SESSION_GONE))) throw new SessionGoneError(resumed);
  return { result: fromSdkResult(result, cause), model, toolCalls };
}

const REPLAY_CHUNK = /.{1,12}/gsu;

export const replayChunks = (reply: string): string[] => reply.match(REPLAY_CHUNK) ?? [];

/** A replayed turn's stand-in for the SDK's session id, new each turn as a live one is, so a follow-up's resume shows in replay. */
export const replaySessionId = (hash: string) => `replay-${hash.slice(0, 16)}`;

const replayTranscript = (configDir: string, sessionId: string) => join(configDir, 'replay-sessions', `${sessionId}.json`);

/** A session's entry in a config dir: a live transcript (`<uuid>.jsonl`) or its folder, or a replayed stand-in. */
const SESSION_ENTRY = /^(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|replay-[0-9a-f]{16})(?:\.jsonl?)?$/;

const kindOf = (path: string) => {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return stat?.isFile() ? 'file' : stat?.isDirectory() ? 'folder' : 'other';
};

/** Whether `path` really lies below `root`, whatever symlink its route crosses. */
function inside(root: string, path: string): boolean {
  const route = relative(root, realpathSync(path));
  return route !== '' && !route.startsWith('..') && !isAbsolute(route);
}

/** The names in a real folder below `root`; a symlink, a file or a folder that leads out reads as empty. */
const names = (root: string, dir: string) => (kindOf(dir) === 'folder' && inside(root, dir) ? readdirSync(dir) : []);

/** Deletes the regular files below `path`, and the folders they leave empty. A symlink and what it points to stay. */
function removeFiles(root: string, path: string): void {
  const kind = kindOf(path);
  if (kind === 'file' && inside(root, path)) unlinkSync(path);
  if (kind !== 'folder') return;
  for (const name of names(root, path)) removeFiles(root, join(path, name));
  if (names(root, path).length === 0) rmdirSync(path);
}

/**
 * Removes every session but `keep` from a config dir. Each resumed turn forks the whole transcript into a new session,
 * so a conversation keeps only the one its next question resumes (#340). The SDK writes live transcripts under
 * `projects/<cwd>/`; replay writes its stand-ins under `replay-sessions/`. It touches only regular files that lie in
 * the config dir and follows no symlink.
 */
export function pruneTranscripts(configDir: string, keep: string): void {
  if (kindOf(configDir) !== 'folder') return;
  const root = realpathSync(configDir);
  const projects = join(root, 'projects');
  for (const holder of [join(root, 'replay-sessions'), ...names(root, projects).map((project) => join(projects, project))]) {
    for (const name of names(root, holder)) {
      const id = SESSION_ENTRY.exec(name)?.groups?.id;
      if (id !== undefined && id !== keep) removeFiles(root, join(holder, name));
    }
  }
}

/**
 * Replays the recorded model turns while the tools, the policy and every write run for real (AGENT.md §8). A call the
 * policy denies is booked as a permission denial, as the SDK books a PreToolUse deny, and the replay goes on.
 */
export async function replaySession(request: SessionRequest, replayDir: string): Promise<SessionRun> {
  const input = canonicalInput(request);
  const resumed = request.resume?.sessionId ?? null;
  if (resumed !== null && keepsTranscript(request) && !existsSync(replayTranscript(request.configDir, resumed))) throw new SessionGoneError(resumed);
  const recording = readRecording(replayDir, input);
  console.log(`[agent] replay ${recordingPath(replayDir, input.kind, inputHash(input))}`);
  const policy = toolPolicy(request);
  const toolCalls: ToolCall[] = [];
  const permissionDenials: { tool_name: string; tool_use_id: string; tool_input: Json }[] = [];
  for (const [index, call] of recording.toolCalls.entries()) {
    const input = JSON.parse(request.canon.restore(JSON.stringify(call.input))) as Record<string, unknown>;
    toolCalls.push({ name: call.name, input });
    const decision = decideToolUse(policy, call.name, input);
    if (!decision.allow) {
      console.warn(`[agent] denied ${call.name}: ${decision.reason}`);
      permissionDenials.push({ tool_name: call.name, tool_use_id: `replay-${index + 1}`, tool_input: input as Json });
      continue;
    }
    // The recording already holds the model's next turn, so the answer is dropped; an error other than a rejection fails the job.
    const tool = request.tools.get(call.name);
    if (tool !== undefined) await runTool(tool, input);
    else if (call.result !== undefined) observeBuiltIn(request, policy, { name: call.name, input, result: JSON.parse(request.canon.restore(JSON.stringify(call.result))) as unknown });
  }
  const reply = request.canon.restore(recording.reply);
  const sessionId = replaySessionId(inputHash(input));
  if (request.onText !== undefined) for (const chunk of replayChunks(reply)) await request.onText(chunk);
  if (keepsTranscript(request)) {
    mkdirSync(join(request.configDir, 'replay-sessions'), { recursive: true });
    writeFileSync(replayTranscript(request.configDir, sessionId), `${JSON.stringify({ inputHash: inputHash(input) })}\n`);
  }
  return {
    result: {
      isError: recording.isError ?? false,
      cause: recording.cause ?? null,
      subtype: 'success',
      text: reply,
      numTurns: recording.numTurns,
      sessionId,
      costUsd: 0,
      usage: {},
      modelUsage: {},
      permissionDenials,
    },
    model: recording.model,
    toolCalls,
  };
}
