import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decideToolUse, pathPolicyHook, type ToolPolicy } from './path-policy';

const jobsDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-policy-')));
const jobDir = join(jobsDir, 'extract_document-a');
const siblingDir = join(jobsDir, 'extract_document-b');
mkdirSync(jobDir);
mkdirSync(siblingDir);
writeFileSync(join(jobDir, 'page-1.png'), 'png');
writeFileSync(join(siblingDir, 'secret.png'), 'png');
symlinkSync(join(siblingDir, 'secret.png'), join(jobDir, 'link.png'));
afterAll(() => rmSync(jobsDir, { recursive: true, force: true }));

const policy: ToolPolicy = { allowed: new Set(['Read', 'mcp__esta__save_extraction']), jobDir };

describe('decideToolUse', () => {
  it('allows Read inside the job directory, by relative or absolute path', () => {
    expect(decideToolUse(policy, 'Read', { file_path: 'page-1.png' })).toEqual({ allow: true });
    expect(decideToolUse(policy, 'Read', { file_path: join(jobDir, 'page-1.png') })).toEqual({ allow: true });
  });

  it('denies /etc/hosts', () => {
    expect(decideToolUse(policy, 'Read', { file_path: '/etc/hosts' })).toEqual({ allow: false, reason: '/etc/hosts is outside the job directory' });
  });

  it('denies a sibling job directory, by dot-dot path and through a symlink', () => {
    expect(decideToolUse(policy, 'Read', { file_path: '../extract_document-b/secret.png' }).allow).toBe(false);
    expect(decideToolUse(policy, 'Read', { file_path: join(siblingDir, 'secret.png') }).allow).toBe(false);
    expect(decideToolUse(policy, 'Read', { file_path: 'link.png' }).allow).toBe(false);
  });

  it('denies a Read with no path', () => {
    expect(decideToolUse(policy, 'Read', {}).allow).toBe(false);
  });

  it('denies every tool outside the kind list', () => {
    for (const tool of ['Bash', 'Write', 'Glob', 'WebFetch', 'mcp__esta__household_info']) {
      expect(decideToolUse(policy, tool, {})).toEqual({ allow: false, reason: `${tool} is not a tool of this job` });
    }
  });

  it('allows a listed MCP tool', () => {
    expect(decideToolUse(policy, 'mcp__esta__save_extraction', {})).toEqual({ allow: true });
  });
});

describe('pathPolicyHook', () => {
  const hookInput = (tool_name: string, tool_input: unknown) =>
    ({ hook_event_name: 'PreToolUse', tool_name, tool_input, session_id: 's', transcript_path: '', cwd: jobDir, tool_use_id: 't' }) as const;
  const options = { signal: new AbortController().signal };

  it('returns a deny decision and reports it', async () => {
    const denied: string[] = [];
    const hook = pathPolicyHook(policy, (tool, reason) => denied.push(`${tool}: ${reason}`));
    const output = await hook(hookInput('Read', { file_path: '/etc/hosts' }), 't', options);
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Denied by Esta policy: /etc/hosts is outside the job directory',
      },
    });
    expect(denied).toEqual(['Read: /etc/hosts is outside the job directory']);
  });

  it('adds nothing for an allowed call', async () => {
    const hook = pathPolicyHook(policy, () => {});
    expect(await hook(hookInput('Read', { file_path: 'page-1.png' }), 't', options)).toEqual({});
  });
});
