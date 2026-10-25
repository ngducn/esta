import { query, type HookCallback, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Json } from '@esta/db';
import type { RunMode } from '../env';
import type { JobSpec } from '../jobs/registry';
import { inputHash, type CanonicalInput, type Canonicalizer } from '../replay/canonicalize';
import { readRecording, recordingPath } from '../replay/store';
import { estaServer, runTool, type EstaTools } from '../tools/server';
import { buildSdkEnv, buildSdkOptions } from './options';
import { decideToolUse, pathPolicyHook, rememberSearchHits, toolCaps, type ToolPolicy } from './path-policy';
import { fromSdkResult, type SessionResult } from './result';

export type ToolCall = { readonly name: string; readonly input: Record<string, unknown> };

export type BuiltInResult = ToolCall & { readonly result: unknown };

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
};

export function canonicalInput({ spec, prompt, canon, resume }: Pick<SessionRequest, 'spec' | 'prompt' | 'canon' | 'resume'>): CanonicalInput {
  return {
    ...(resume === undefined ? {} : { resumesInputHash: resume.afterInputHash }),
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

export async function liveSession(request: SessionRequest, mode: Extract<RunMode, { agentMode: 'live' }>): Promise<SessionRun> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), request.spec.timeoutMs);
  const toolFailures: unknown[] = [];
  const policy = toolPolicy(request);
  const options = buildSdkOptions({
    spec: request.spec,
    jobDir: request.jobDir,
    model: mode.model,
    env: buildSdkEnv({ credential: mode.credential, configDir: request.configDir, path: process.env.PATH ?? '/usr/bin:/bin' }),
    server: estaServer(request.tools, (error) => {
      toolFailures.push(error);
      abortController.abort();
    }),
    preToolUse: pathPolicyHook(policy, (toolName, reason) => console.warn(`[agent] denied ${toolName}: ${reason}`)),
    postToolUse: observeHook(request, policy),
    abortController,
    ...(request.onText === undefined ? {} : { streaming: { resume: request.resume?.sessionId ?? null } }),
  });
  const toolCalls: ToolCall[] = [];
  let result: SDKResultMessage | undefined;
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
      } else if (message.type === 'assistant') {
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
  return { result: fromSdkResult(result), model: mode.model, toolCalls };
}

const REPLAY_CHUNK = /.{1,12}/gsu;

export const replayChunks = (reply: string): string[] => reply.match(REPLAY_CHUNK) ?? [];

/**
 * Replays the recorded model turns while the tools, the policy and every write run for real (AGENT.md §8). A call the
 * policy denies is booked as a permission denial, as the SDK books a PreToolUse deny, and the replay goes on.
 */
export async function replaySession(request: SessionRequest, replayDir: string): Promise<SessionRun> {
  const input = canonicalInput(request);
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
  if (request.onText !== undefined) for (const chunk of replayChunks(reply)) await request.onText(chunk);
  return {
    result: {
      isError: false,
      subtype: 'success',
      text: reply,
      numTurns: recording.numTurns,
      sessionId: null,
      costUsd: 0,
      usage: {},
      modelUsage: {},
      permissionDenials,
    },
    model: recording.model,
    toolCalls,
  };
}
