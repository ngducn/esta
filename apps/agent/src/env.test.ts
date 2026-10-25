import { FROZEN_CLOCK_REFUSAL } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { assertStartAllowed, parseAgentEnv } from './env';

const base = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'service-key', ESTA_ENV: 'development' };

describe('assertStartAllowed', () => {
  it('starts replay with no credential and records auth mode none', () => {
    const env = parseAgentEnv({ ...base, ESTA_AGENT_MODE: 'replay', CLAUDE_CODE_OAUTH_TOKEN: '', ANTHROPIC_API_KEY: '' });
    expect(assertStartAllowed(env)).toEqual({ agentMode: 'replay', authMode: 'none' });
  });

  it('never carries a credential in replay even when one is set', () => {
    const env = parseAgentEnv({ ...base, ESTA_AGENT_MODE: 'replay', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token' });
    expect(JSON.stringify(assertStartAllowed(env))).not.toContain('oauth-token');
  });

  it('refuses live api_key mode without ANTHROPIC_API_KEY and names both variables', () => {
    const env = parseAgentEnv({ ...base, ESTA_AGENT_MODE: 'live', ESTA_AUTH_MODE: 'api_key', ANTHROPIC_API_KEY: '', ESTA_MODEL_ROUTINE: 'm' });
    expect(() => assertStartAllowed(env)).toThrow(/ESTA_AUTH_MODE=api_key needs ANTHROPIC_API_KEY/);
  });

  it('refuses live subscription mode without CLAUDE_CODE_OAUTH_TOKEN, even with an API key set', () => {
    const env = parseAgentEnv({ ...base, ESTA_MODEL_ROUTINE: 'm', ANTHROPIC_API_KEY: 'decoy' });
    expect(() => assertStartAllowed(env)).toThrow(/ESTA_AUTH_MODE=subscription needs CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it('starts live subscription mode with only the token as its credential', () => {
    const env = parseAgentEnv({ ...base, CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token', ANTHROPIC_API_KEY: 'decoy', ESTA_MODEL_ROUTINE: 'm' });
    expect(assertStartAllowed(env)).toEqual({
      agentMode: 'live',
      authMode: 'subscription',
      credential: { name: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'oauth-token' },
      model: 'm',
      deepModel: null,
    });
  });

  it('starts live api_key mode with only the key as its credential', () => {
    const env = parseAgentEnv({ ...base, ESTA_AUTH_MODE: 'api_key', ANTHROPIC_API_KEY: 'api-key', CLAUDE_CODE_OAUTH_TOKEN: 'decoy', ESTA_MODEL_ROUTINE: 'm' });
    expect(assertStartAllowed(env)).toMatchObject({ authMode: 'api_key', credential: { name: 'ANTHROPIC_API_KEY', value: 'api-key' } });
  });

  it('refuses live mode without a routine model', () => {
    const env = parseAgentEnv({ ...base, CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token' });
    expect(() => assertStartAllowed(env)).toThrow(/ESTA_MODEL_ROUTINE/);
  });

  it.each([undefined, ''])('refuses live mode without an explicit ESTA_ENV (ESTA_ENV=%j)', (estaEnv) => {
    const env = parseAgentEnv({ ...base, ESTA_ENV: estaEnv, CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token', ESTA_MODEL_ROUTINE: 'm' });
    expect(() => assertStartAllowed(env)).toThrow('Refusing to start: ESTA_AGENT_MODE=live needs an explicit ESTA_ENV, which is not set');
  });

  it('starts replay without ESTA_ENV', () => {
    const env = parseAgentEnv({ ...base, ESTA_ENV: undefined, ESTA_AGENT_MODE: 'replay' });
    expect(assertStartAllowed(env)).toEqual({ agentMode: 'replay', authMode: 'none' });
  });

  it('refuses a frozen clock under ESTA_ENV=production', () => {
    const env = parseAgentEnv({ ...base, ESTA_AGENT_MODE: 'replay', ESTA_ENV: 'production', ESTA_FROZEN_NOW: '2026-10-07T09:00:00+07:00' });
    expect(() => assertStartAllowed(env)).toThrow(FROZEN_CLOCK_REFUSAL);
  });
});
