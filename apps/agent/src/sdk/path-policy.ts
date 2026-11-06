import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { fetchKey } from '@esta/core/research';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { mcpToolName } from '../tools/server';
import { searchDenial, type SearchTerm } from './search-guard';

/** Why a call was denied, as a word the run record keeps instead of the call's input. */
export type DenialCode = 'number' | 'family_data' | 'cap' | 'not_fetchable' | 'policy';

export type ToolDecision = { readonly allow: true } | { readonly allow: false; readonly reason: string; readonly code: DenialCode };

export type ToolPolicy = {
  readonly allowed: ReadonlySet<string>;
  /** Already resolved through symlinks, so a comparison against a resolved target is exact. */
  readonly jobDir: string;
  /** Calls a built-in tool may make in one run, such as research_scan's searches and fetches (AGENT.md §5.2), with the count allowed so far. */
  readonly caps?: ReadonlyMap<string, ToolCap>;
  /** The links this run's WebSearch returned, as `fetchKey` folds them: the only pages WebFetch may open, so a page cannot send the model elsewhere (#323). */
  readonly fetchable?: Set<string>;
  /** The names, nicknames and streets of the household's records, which no WebSearch query may hold. */
  readonly searchTerms?: readonly SearchTerm[];
};

export type ToolCap = { readonly max: number; used: number };

export const toolCaps = (caps: Readonly<Record<string, number>>): ReadonlyMap<string, ToolCap> => new Map(Object.entries(caps).map(([name, max]) => [name, { max, used: 0 }]));

const PATH_FIELDS: ReadonlyMap<string, string> = new Map([['Read', 'file_path']]);

type InputRule = (input: Readonly<Record<string, unknown>>) => string | null;

const WEB_RULES: ReadonlyMap<string, InputRule> = new Map<string, InputRule>([
  ['WebSearch', (input) => (typeof input.query === 'string' && input.query.trim() !== '' ? null : 'WebSearch needs a query')],
  ['WebFetch', (input) => (typeof input.url === 'string' && /^https:\/\/[^\s/]+/i.test(input.url) ? null : 'WebFetch reads one https page')],
]);

const searchHits = z.object({ results: z.array(z.union([z.object({ content: z.array(z.object({ url: z.string() })) }), z.string()])) });

/** Adds the links a WebSearch call returned to the pages WebFetch may open. */
export function rememberSearchHits(policy: ToolPolicy, toolName: string, result: unknown): void {
  if (toolName !== 'WebSearch' || policy.fetchable === undefined) return;
  for (const block of searchHits.safeParse(result).data?.results ?? []) {
    if (typeof block === 'string') continue;
    for (const hit of block.content) {
      const key = fetchKey(hit.url);
      if (key.ok) policy.fetchable.add(key.value);
    }
  }
}

type Broken = { readonly code: DenialCode; readonly reason: string };

function searched(policy: ToolPolicy, toolName: string, input: Readonly<Record<string, unknown>>): Broken | null {
  if (toolName !== 'WebFetch' || policy.fetchable === undefined) return null;
  const key = fetchKey(String(input.url));
  return key.ok && policy.fetchable.has(key.value) ? null : { code: 'not_fetchable', reason: "WebFetch may open only a page this run's WebSearch returned, with its link as the search gave it" };
}

function withinCap(policy: ToolPolicy, toolName: string): ToolDecision {
  const cap = policy.caps?.get(toolName);
  if (cap === undefined) return { allow: true };
  if (cap.used >= cap.max) return { allow: false, code: 'cap', reason: `${toolName} reached this run's cap of ${cap.max} calls` };
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
  if (!policy.allowed.has(toolName)) return { allow: false, code: 'policy', reason: `${toolName} is not a tool of this job` };
  if (toolName.startsWith(ESTA_TOOL_PREFIX)) return { allow: true };
  const web = WEB_RULES.get(toolName);
  if (web !== undefined) {
    const invalid = web(input);
    const broken: Broken | null =
      invalid === null ? (searched(policy, toolName, input) ?? (toolName === 'WebSearch' && policy.searchTerms !== undefined ? searchDenial(String(input.query), policy.searchTerms) : null)) : { code: 'policy', reason: invalid };
    return broken === null ? withinCap(policy, toolName) : { allow: false, ...broken };
  }
  const field = PATH_FIELDS.get(toolName);
  if (field === undefined) return { allow: false, code: 'policy', reason: `${toolName} has no input rule` };
  const raw = input[field];
  if (typeof raw !== 'string' || raw === '') return { allow: false, code: 'policy', reason: `${toolName} needs a ${field}` };
  // Whether Read trims before it expands `~` is unproven, so a padded path never reaches the checks below (#54).
  if (raw !== raw.trim()) return { allow: false, code: 'policy', reason: `${JSON.stringify(raw)} has leading or trailing whitespace` };
  // The SDK's Read expands a leading `~` to a home directory, which no job directory contains.
  if (raw.startsWith('~')) return { allow: false, code: 'policy', reason: `${raw} is outside the job directory` };
  const target = realTarget(policy.jobDir, raw);
  return isInside(policy.jobDir, target) ? { allow: true } : { allow: false, code: 'policy', reason: `${raw} is outside the job directory` };
}

/** `allowedTools` auto-approves before `canUseTool` runs, so the policy runs as a PreToolUse hook (S1 correction 1). */
export const isWebTool = (toolName: string): boolean => WEB_RULES.has(toolName);

export function pathPolicyHook(policy: ToolPolicy, onDeny: (toolName: string, reason: string) => void, onWebTool?: () => Promise<void>): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? (input.tool_input as Record<string, unknown>) : {};
    const decision = decideToolUse(policy, input.tool_name, toolInput);
    if (decision.allow) {
      if (isWebTool(input.tool_name)) await onWebTool?.();
      return {};
    }
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
