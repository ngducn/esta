import { describe, expect, it } from 'vitest';
import { JOBS } from '../jobs/registry';
import { estaServer } from '../tools/server';
import { buildSdkEnv, buildSdkOptions } from './options';

const SECRET_NAMES = /^(ANTHROPIC_|CLAUDE_CODE_)/;

describe('buildSdkEnv', () => {
  it.each([
    { name: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'oauth-token' },
    { name: 'ANTHROPIC_API_KEY', value: 'api-key' },
  ] as const)('holds exactly one credential, $name', (credential) => {
    const env = buildSdkEnv({ credential, configDir: '/agent/config', path: '/usr/bin' });
    expect(Object.keys(env).filter((key) => SECRET_NAMES.test(key))).toEqual([credential.name]);
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/agent/config',
      LANG: 'en_US.UTF-8',
      CLAUDE_CONFIG_DIR: '/agent/config',
      [credential.name]: credential.value,
    });
  });
});

describe('buildSdkOptions', () => {
  it('gives ping no built-in tool, isolated settings and the routine model', () => {
    const options = buildSdkOptions({
      spec: JOBS.ping,
      jobDir: '/agent/jobs/ping-1',
      model: 'routine-model',
      env: {},
      server: estaServer(new Map(), () => undefined),
      preToolUse: async () => ({}),
      postToolUse: async () => ({}),
      abortController: new AbortController(),
    });
    expect(options).toMatchObject({
      model: 'routine-model',
      cwd: '/agent/jobs/ping-1',
      settingSources: [],
      strictMcpConfig: true,
      tools: [],
      allowedTools: ['mcp__esta__household_info'],
      permissionMode: 'default',
      maxTurns: 3,
      persistSession: false,
    });
    expect(options.hooks?.PreToolUse).toHaveLength(1);
    expect(options.hooks?.PostToolUse).toHaveLength(1);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['esta']);
  });

  it('never keeps the transcript of a job that reads pages', () => {
    const inputs = { jobDir: '/agent/jobs/x', model: 'm', env: {}, server: estaServer(new Map(), () => undefined), preToolUse: async () => ({}), postToolUse: async () => ({}), abortController: new AbortController() };
    expect(buildSdkOptions({ ...inputs, spec: JOBS.ask, streaming: { resume: null } })).toMatchObject({ persistSession: true, includePartialMessages: true });
    expect(() => buildSdkOptions({ ...inputs, spec: JOBS.research_scan, streaming: { resume: null } })).toThrow('may not read pages');
  });
});
