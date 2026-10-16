import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { RunMode } from '../env';
import type { JobSpec } from '../jobs/registry';
import type { CanonicalInput, Canonicalizer } from '../replay/canonicalize';
import { readRecording } from '../replay/store';
import { estaServer, type EstaTool } from '../tools/server';
import { buildSdkEnv, buildSdkOptions } from './options';
import { decideToolUse, pathPolicyHook, type ToolPolicy } from './path-policy';
import { fromSdkResult, type SessionResult } from './result';

export type ToolCall = { readonly name: string; readonly input: Record<string, unknown> };

export type SessionRun = { readonly result: SessionResult; readonly model: string; readonly toolCalls: readonly ToolCall[] };

export type SessionRequest = {
  readonly spec: JobSpec;
  readonly prompt: string;
  readonly jobDir: string;
  readonly configDir: string;
  readonly tools: ReadonlyMap<string, EstaTool>;
  readonly canon: Canonicalizer;
};

export function canonicalInput({ spec, prompt, canon }: Pick<SessionRequest, 'spec' | 'prompt' | 'canon'>): CanonicalInput {
  return {
    version: 1,
    kind: spec.kind,
    prompt: canon.canonical(prompt),
    builtInTools: [...spec.builtInTools],
    mcpTools: [...spec.mcpTools],
    maxTurns: spec.maxTurns,
  };
}

function toolPolicy({ spec, jobDir, tools }: SessionRequest): ToolPolicy {
  return { allowed: new Set([...spec.builtInTools, ...tools.keys()]), jobDir };
}

export async function liveSession(request: SessionRequest, mode: Extract<RunMode, { agentMode: 'live' }>): Promise<SessionRun> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), request.spec.timeoutMs);
  const options = buildSdkOptions({
    spec: request.spec,
    jobDir: request.jobDir,
    model: mode.model,
    env: buildSdkEnv({ credential: mode.credential, configDir: request.configDir, path: process.env.PATH ?? '/usr/bin:/bin' }),
    server: estaServer(request.tools),
    preToolUse: pathPolicyHook(toolPolicy(request), (toolName, reason) => console.warn(`[agent] denied ${toolName}: ${reason}`)),
    abortController,
  });
  const toolCalls: ToolCall[] = [];
  let result: SDKResultMessage | undefined;
  try {
    for await (const message of query({ prompt: request.prompt, options })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
        }
      } else if (message.type === 'result') {
        result = message;
      }
    }
  } catch (error) {
    // The SDK throws after it has yielded an error result; that result already says what failed.
    if (result === undefined) throw error;
  } finally {
    clearTimeout(timer);
  }
  if (result === undefined) throw new Error('The model session ended without a result');
  return { result: fromSdkResult(result), model: mode.model, toolCalls };
}

/** Replays the recorded model turns while the tools, the policy and every write run for real (AGENT.md §8). */
export async function replaySession(request: SessionRequest, replayDir: string): Promise<SessionRun> {
  const recording = readRecording(replayDir, canonicalInput(request));
  const policy = toolPolicy(request);
  const toolCalls: ToolCall[] = [];
  for (const call of recording.toolCalls) {
    const input = JSON.parse(request.canon.restore(JSON.stringify(call.input))) as Record<string, unknown>;
    const decision = decideToolUse(policy, call.name, input);
    if (!decision.allow) throw new Error(`The ${recording.kind} recording calls ${call.name}, which the policy denies: ${decision.reason}`);
    await request.tools.get(call.name)?.run();
    toolCalls.push({ name: call.name, input });
  }
  return {
    result: {
      isError: false,
      subtype: 'success',
      text: request.canon.restore(recording.reply),
      numTurns: recording.numTurns,
      sessionId: null,
      costUsd: 0,
      usage: {},
      modelUsage: {},
      permissionDenials: [],
    },
    model: recording.model,
    toolCalls,
  };
}
