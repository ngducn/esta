import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { mcpToolName } from '../tools/server';

export type ToolDecision = { readonly allow: true } | { readonly allow: false; readonly reason: string };

export type ToolPolicy = {
  readonly allowed: ReadonlySet<string>;
  /** Already resolved through symlinks, so a comparison against a resolved target is exact. */
  readonly jobDir: string;
  /** Calls a built-in tool may make in one run, such as research_scan's searches and fetches (AGENT.md §5.2), with the count allowed so far. */
  readonly caps?: ReadonlyMap<string, ToolCap>;
};

export type ToolCap = { readonly max: number; used: number };

export const toolCaps = (caps: Readonly<Record<string, number>>): ReadonlyMap<string, ToolCap> => new Map(Object.entries(caps).map(([name, max]) => [name, { max, used: 0 }]));

const PATH_FIELDS: ReadonlyMap<string, string> = new Map([['Read', 'file_path']]);

type InputRule = (input: Readonly<Record<string, unknown>>) => string | null;

const WEB_RULES: ReadonlyMap<string, InputRule> = new Map<string, InputRule>([
  ['WebSearch', (input) => (typeof input.query === 'string' && input.query.trim() !== '' ? null : 'WebSearch needs a query')],
  ['WebFetch', (input) => (typeof input.url === 'string' && /^https:\/\/[^\s/]+/i.test(input.url) ? null : 'WebFetch reads one https page')],
]);

function withinCap(policy: ToolPolicy, toolName: string): ToolDecision {
  const cap = policy.caps?.get(toolName);
  if (cap === undefined) return { allow: true };
  if (cap.used >= cap.max) return { allow: false, reason: `${toolName} reached this run's cap of ${cap.max} calls` };
  cap.used += 1;
  return { allow: true };
}

/** Esta's own tools parse their input with zod and read only the job's household. */
const ESTA_TOOL_PREFIX = mcpToolName('');

function realOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Resolves each symlink before the next `..`, as the kernel does, so `link/..` cannot leave the job dir. */
function realTarget(jobDir: string, path: string): string {
  let current = isAbsolute(path) ? sep : jobDir;
  for (const part of path.split(sep)) {
    if (part === '' || part === '.') continue;
    current = part === '..' ? dirname(current) : realOrSelf(join(current, part));
  }
  return current;
}

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function decideToolUse(policy: ToolPolicy, toolName: string, input: Readonly<Record<string, unknown>>): ToolDecision {
  if (!policy.allowed.has(toolName)) return { allow: false, reason: `${toolName} is not a tool of this job` };
  if (toolName.startsWith(ESTA_TOOL_PREFIX)) return { allow: true };
  const web = WEB_RULES.get(toolName);
  if (web !== undefined) {
    const broken = web(input);
    return broken === null ? withinCap(policy, toolName) : { allow: false, reason: broken };
  }
  const field = PATH_FIELDS.get(toolName);
  if (field === undefined) return { allow: false, reason: `${toolName} has no input rule` };
  const raw = input[field];
  if (typeof raw !== 'string' || raw === '') return { allow: false, reason: `${toolName} needs a ${field}` };
  // Whether Read trims before it expands `~` is unproven, so a padded path never reaches the checks below (#54).
  if (raw !== raw.trim()) return { allow: false, reason: `${JSON.stringify(raw)} has leading or trailing whitespace` };
  // The SDK's Read expands a leading `~` to a home directory, which no job directory contains.
  if (raw.startsWith('~')) return { allow: false, reason: `${raw} is outside the job directory` };
  const target = realTarget(policy.jobDir, raw);
  return isInside(policy.jobDir, target) ? { allow: true } : { allow: false, reason: `${raw} is outside the job directory` };
}

/** `allowedTools` auto-approves before `canUseTool` runs, so the policy runs as a PreToolUse hook (S1 correction 1). */
export function pathPolicyHook(policy: ToolPolicy, onDeny: (toolName: string, reason: string) => void): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? (input.tool_input as Record<string, unknown>) : {};
    const decision = decideToolUse(policy, input.tool_name, toolInput);
    if (decision.allow) return {};
    onDeny(input.tool_name, decision.reason);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Denied by Esta policy: ${decision.reason}`,
      },
    };
  };
}
