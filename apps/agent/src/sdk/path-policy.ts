import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export type ToolDecision = { readonly allow: true } | { readonly allow: false; readonly reason: string };

export type ToolPolicy = {
  readonly allowed: ReadonlySet<string>;
  /** Already resolved through symlinks, so a comparison against a resolved target is exact. */
  readonly jobDir: string;
};

const PATH_FIELDS: Readonly<Record<string, string>> = { Read: 'file_path' };

/** Resolves symlinks on the longest existing prefix, so a link inside the job dir cannot point a read outside it. */
function realTarget(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(realTarget(parent), relative(parent, path));
  }
}

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function decideToolUse(policy: ToolPolicy, toolName: string, input: Readonly<Record<string, unknown>>): ToolDecision {
  if (!policy.allowed.has(toolName)) return { allow: false, reason: `${toolName} is not a tool of this job` };
  const field = PATH_FIELDS[toolName];
  if (field === undefined) return { allow: true };
  const raw = input[field];
  if (typeof raw !== 'string' || raw === '') return { allow: false, reason: `${toolName} needs a ${field}` };
  const target = realTarget(resolve(policy.jobDir, raw));
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
