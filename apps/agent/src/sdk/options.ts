import type { HookCallback, McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import type { Credential } from '../env';
import type { JobSpec } from '../jobs/registry';
import { mcpToolName, SERVER_NAME } from '../tools/server';

export type SdkEnvInputs = {
  readonly credential: Credential;
  /** An empty per-worker directory, so the SDK never sees the operator's Claude login, settings or plugins. */
  readonly configDir: string;
  readonly path: string;
};

/** `env` replaces the subprocess environment, so it holds the one active credential and nothing else secret (S1 correction 4). */
export function buildSdkEnv({ credential, configDir, path }: SdkEnvInputs): Record<string, string> {
  return {
    PATH: path,
    HOME: configDir,
    LANG: 'en_US.UTF-8',
    CLAUDE_CONFIG_DIR: configDir,
    [credential.name]: credential.value,
  };
}

export type SdkOptionsInputs = {
  readonly spec: JobSpec;
  readonly jobDir: string;
  readonly model: string;
  readonly env: Record<string, string>;
  readonly server: McpSdkServerConfigWithInstance;
  readonly preToolUse: HookCallback;
  readonly postToolUse: HookCallback;
  readonly abortController: AbortController;
  readonly streaming?: { readonly resume: string | null };
};

/**
 * `persistSession: false` keeps the SDK from writing a transcript, which would hold the page text the model read, to
 * disk. A streaming job reads no page or document, so it keeps its transcript for the repair turn to resume.
 */
export function buildSdkOptions({ spec, jobDir, model, env, server, preToolUse, postToolUse, abortController, streaming }: SdkOptionsInputs): Options {
  return {
    model,
    cwd: jobDir,
    env,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { [SERVER_NAME]: server },
    tools: [...spec.builtInTools],
    allowedTools: [...spec.builtInTools, ...spec.mcpTools.map(mcpToolName)],
    hooks: { PreToolUse: [{ hooks: [preToolUse] }], PostToolUse: [{ hooks: [postToolUse] }] },
    permissionMode: 'default',
    maxTurns: spec.maxTurns,
    abortController,
    persistSession: streaming !== undefined,
    ...(streaming === undefined ? {} : { includePartialMessages: true, ...(streaming.resume === null ? {} : { resume: streaming.resume }) }),
  };
}
