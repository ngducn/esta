import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import {
  createSdkMcpServer,
  query,
  tool,
  type CanUseTool,
  type HookCallback,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Resvg } from '@resvg/resvg-js';
import { z } from 'zod';
import { startMockApi, type MockApi } from './mock-api.ts';

type Mode = 'live' | 'no-credential' | 'mock';
type ReadGate = 'allowlist' | 'callback' | 'hook';

const DEFAULT_ENV_FILE = '/Users/ngducn/Workplace/esta/apps/agent/.env.local';
const TIMEOUT_MS = 120_000;
const MAX_TURNS = 6;
const HOUSEHOLD_TOOL = 'mcp__esta__household_info';
const PERMITTED_TOOLS = new Set([HOUSEHOLD_TOOL, 'Read']);
const DISALLOWED_TOOLS = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Agent', 'WebFetch', 'WebSearch'];
const IMAGE_TEXT = 'Thửa đất số 1234, tờ bản đồ số 56, Nguyễn Văn Demo';

function refuse(message: string): never {
  console.error(`[s1] refusing to start: ${message}`);
  process.exit(2);
}

function parseMode(arg: string | undefined): Mode {
  if (arg === undefined || arg === 'live') return 'live';
  if (arg === 'no-credential' || arg === 'mock') return arg;
  refuse(`unknown mode "${arg}" (expected live | no-credential | mock)`);
}

function parseReadGate(value: string | undefined): ReadGate {
  if (value === undefined || value === 'allowlist') return 'allowlist';
  if (value === 'callback' || value === 'hook') return value;
  refuse(`S1_READ_GATE must be allowlist, callback or hook, got "${value}"`);
}

function readEnvFile(path: string): Record<string, string | undefined> {
  if (!existsSync(path)) {
    refuse(
      `token file ${path} does not exist. Run \`claude setup-token\` and write ` +
        `CLAUDE_CODE_OAUTH_TOKEN=<token> into it (or point S1_ENV_FILE at another file).`,
    );
  }
  return parseEnv(readFileSync(path, 'utf8'));
}

function loadToken(fileEnv: Record<string, string | undefined>, path: string): string {
  const token = fileEnv.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (!token) refuse(`${path} has no CLAUDE_CODE_OAUTH_TOKEN value`);
  return token;
}

function isolatedEnv(configDir: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? configDir,
    TMPDIR: tmpdir(),
    LANG: 'en_US.UTF-8',
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'esta-spike-s1/0',
    ...extra,
  };
  const leaked = Object.keys(env).filter(
    (k) => /^(ANTHROPIC_|CLAUDE_)/.test(k) && !['CLAUDE_CONFIG_DIR', 'CLAUDE_AGENT_SDK_CLIENT_APP', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_BASE_URL'].includes(k),
  );
  if (leaked.length > 0) refuse(`credential-like variables in SDK env: ${leaked.join(', ')}`);
  return env;
}

function renderImage(path: string): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="200">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="40" y="115" font-family="Arial" font-size="40" fill="#111111">${IMAGE_TEXT}</text>
</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng();
  writeFileSync(path, png);
}

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((b: { type?: string; text?: string }) => (b.type === 'text' ? b.text : `[${b.type}]`))
    .join('');
}

const mode = parseMode(process.argv[2]);
const readGate = parseReadGate(process.env.S1_READ_GATE);
const envFile = process.env.S1_ENV_FILE ?? DEFAULT_ENV_FILE;

const fileEnv = mode === 'live' ? readEnvFile(envFile) : {};
const token = mode === 'live' ? loadToken(fileEnv, envFile) : undefined;
const model = process.env.ESTA_MODEL_ROUTINE ?? fileEnv.ESTA_MODEL_ROUTINE;
if (!model) refuse('ESTA_MODEL_ROUTINE is not set (env or token file); there is no default');

const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-s1-job-')));
const configDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-s1-config-')));
const imagePath = join(jobDir, 'image.png');
renderImage(imagePath);

let mock: MockApi | undefined;
if (mode === 'mock') {
  mock = await startMockApi([
    { name: HOUSEHOLD_TOOL, input: {} },
    { name: 'Read', input: { file_path: imagePath } },
    { name: 'Read', input: { file_path: '/etc/hosts' } },
    { name: 'Bash', input: { command: 'ls', description: 'list files' } },
  ]);
}

const credentialEnv: Record<string, string> =
  mode === 'live'
    ? { CLAUDE_CODE_OAUTH_TOKEN: token as string }
    : mode === 'mock'
      ? { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-mock-not-a-real-token', ANTHROPIC_BASE_URL: (mock as MockApi).url }
      : {};
const sdkEnv = isolatedEnv(configDir, credentialEnv);

console.log(`[s1] mode=${mode} read_gate=${readGate} model=${model}`);
console.log(`[s1] auth mode: ${mode === 'no-credential' ? 'none' : 'subscription'} (CLAUDE_CODE_OAUTH_TOKEN ${token ? `from ${envFile}, ${token.length} chars` : mode === 'mock' ? 'dummy' : 'absent'})`);
console.log(`[s1] env keys passed to SDK: ${Object.keys(sdkEnv).sort().join(', ')}`);
console.log(`[s1] job dir: ${jobDir}`);
console.log(`[s1] config dir (fresh, empty): ${configDir}`);

const denials: string[] = [];
const permissionCalls: string[] = [];

function policy(toolName: string, input: Record<string, unknown>): string | undefined {
  if (!PERMITTED_TOOLS.has(toolName)) return 'tool not on the job allowlist';
  if (toolName !== 'Read') return undefined;
  const raw = typeof input.file_path === 'string' ? input.file_path : '';
  const target = realOrSelf(resolve(jobDir, raw));
  return isInside(jobDir, target) ? undefined : `path ${raw} is outside the job dir`;
}

function recordDenial(gate: string, toolName: string, reason: string): string {
  denials.push(`${gate} denied ${toolName}: ${reason}`);
  console.log(`[s1] DENY (${gate}) ${toolName}: ${reason}`);
  return `Denied by Esta policy: ${reason}`;
}

const canUseTool: CanUseTool = async (toolName, input) => {
  permissionCalls.push(`canUseTool ${toolName} ${JSON.stringify(input)}`);
  const reason = policy(toolName, input);
  if (reason) return { behavior: 'deny', message: recordDenial('canUseTool', toolName, reason) };
  return { behavior: 'allow', updatedInput: input };
};

const preToolUse: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
  permissionCalls.push(`PreToolUse ${input.tool_name} ${JSON.stringify(toolInput)}`);
  const reason = policy(input.tool_name, toolInput);
  if (!reason) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: recordDenial('PreToolUse', input.tool_name, reason),
    },
  };
};

const esta = createSdkMcpServer({
  name: 'esta',
  version: '0.0.0',
  alwaysLoad: true,
  tools: [
    tool('household_info', 'Return basic facts about the current household.', {}, async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ name: 'Gia đình Demo', member_count: 2, property_count: 7, locale: 'vi' }),
        },
      ],
    })),
  ],
});

const prompt = [
  'This is an automated permissions test. Do these steps in order and report each outcome briefly:',
  '1. Call the household_info tool and repeat its JSON result verbatim.',
  '2. Read the file image.png in the current directory and transcribe every word of its text exactly, with Vietnamese diacritics.',
  '3. Try to read /etc/hosts. Report whether it was allowed.',
  '4. Try to run `ls` with the Bash tool. Report whether it was allowed or unavailable.',
  'Finish with a line "TRANSCRIPTION: <the exact text from image.png>".',
].join('\n');

const abortController = new AbortController();
const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS);
const toolNamesById = new Map<string, string>();
const stderrTail: string[] = [];
let exitCode = 0;
const started = Date.now();

try {
  const stream = query({
    prompt,
    options: {
      model,
      cwd: jobDir,
      env: sdkEnv,
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: { esta },
      tools: ['Read'],
      allowedTools: readGate === 'callback' ? [HOUSEHOLD_TOOL] : [HOUSEHOLD_TOOL, 'Read'],
      disallowedTools: DISALLOWED_TOOLS,
      hooks: readGate === 'hook' ? { PreToolUse: [{ hooks: [preToolUse] }] } : {},
      permissionMode: 'default',
      canUseTool,
      maxTurns: MAX_TURNS,
      abortController,
      stderr: (data) => {
        stderrTail.push(data);
        if (stderrTail.length > 20) stderrTail.shift();
      },
    },
  });

  for await (const message of stream as AsyncIterable<SDKMessage>) {
    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`[s1] init: apiKeySource=${message.apiKeySource} model=${message.model} permissionMode=${message.permissionMode}`);
      console.log(`[s1] init: tools=[${message.tools.join(', ')}]`);
      console.log(`[s1] init: mcp_servers=${JSON.stringify(message.mcp_servers)}`);
    } else if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          toolNamesById.set(block.id, block.name);
          console.log(`[s1] tool_use ${block.name} ${JSON.stringify(block.input)}`);
        } else if (block.type === 'text' && block.text.trim()) {
          console.log(`[s1] assistant: ${block.text.trim()}`);
        }
      }
    } else if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (typeof block === 'object' && block.type === 'tool_result') {
          const name = toolNamesById.get(block.tool_use_id) ?? '?';
          const body = textOf(block.content).slice(0, 300);
          console.log(`[s1] tool_result ${name}${block.is_error ? ' (error)' : ''}: ${body}`);
        }
      }
    } else if (message.type === 'result') {
      console.log(`[s1] result: subtype=${message.subtype} is_error=${message.is_error} num_turns=${message.num_turns}`);
      console.log(`[s1] result: session_id=${message.session_id} total_cost_usd=${message.total_cost_usd}`);
      console.log(`[s1] result: usage=${JSON.stringify(message.usage)}`);
      console.log(`[s1] result: permission_denials=${JSON.stringify(message.permission_denials)}`);
      if (message.subtype === 'success') {
        const line = message.result.split('\n').find((l) => l.startsWith('TRANSCRIPTION:'));
        console.log(`[s1] transcription: ${line ?? '(no TRANSCRIPTION line)'}`);
        console.log(`[s1] expected:      TRANSCRIPTION: ${IMAGE_TEXT}`);
      }
      if (message.is_error) exitCode = 1;
    }
  }
} catch (error) {
  exitCode = 1;
  console.log(`[s1] query failed: ${error instanceof Error ? error.message : String(error)}`);
  if (stderrTail.length > 0) console.log(`[s1] stderr tail:\n${stderrTail.join('').trim().slice(-1500)}`);
} finally {
  clearTimeout(timer);
  console.log(`[s1] elapsed_ms=${Date.now() - started}`);
  console.log(`[s1] permission callback calls (${permissionCalls.length}):`);
  for (const c of permissionCalls) console.log(`  ${c}`);
  console.log(`[s1] denials (${denials.length}):`);
  for (const d of denials) console.log(`  ${d}`);
  if (mock) {
    console.log('[s1] mock API log:');
    for (const l of mock.log) console.log(`  ${l}`);
    await mock.close();
  }
  rmSync(jobDir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
}

process.exit(exitCode);
