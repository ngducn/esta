import { describe, expect, it } from 'vitest';
import { countToolCalls, judgeResult, type SessionResult } from './result';

const session = (overrides: Partial<SessionResult>): SessionResult => ({
  isError: false,
  subtype: 'success',
  text: 'Kết nối tốt.',
  numTurns: 2,
  sessionId: 's',
  costUsd: 0.01,
  usage: {},
  modelUsage: {},
  permissionDenials: [],
  cause: null,
  ...overrides,
});

describe('judgeResult', () => {
  it('returns the reply of a successful session', () => {
    expect(judgeResult(session({}))).toEqual({ ok: true, reply: 'Kết nối tốt.' });
  });

  it('fails a success subtype that carries is_error', () => {
    expect(judgeResult(session({ isError: true, text: 'Overloaded' }))).toEqual({ ok: false, failure: { kind: 'error', message: 'Overloaded' } });
  });

  it('records a 401 as auth_error', () => {
    const outcome = judgeResult(session({ isError: true, text: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.' }));
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'auth_error' } });
  });

  it('records a missing login as auth_error', () => {
    expect(judgeResult(session({ isError: true, text: 'Not logged in · Please run /login' }))).toMatchObject({ failure: { kind: 'auth_error' } });
  });

  it('records the SDK rate_limit cause as usage_limit, whatever the text says', () => {
    expect(judgeResult(session({ isError: true, cause: 'rate_limit', text: 'API Error' }))).toMatchObject({ failure: { kind: 'usage_limit', message: 'API Error' } });
  });

  it.each(['Claude AI usage limit reached|1760000000', "You've hit your limit · resets 3pm"])('records %j with no cause as usage_limit', (text) => {
    expect(judgeResult(session({ isError: true, text }))).toMatchObject({ failure: { kind: 'usage_limit' } });
  });

  it('trusts a cause the SDK gave over limit words in the text', () => {
    expect(judgeResult(session({ isError: true, cause: 'overloaded', text: 'Overloaded, not a usage limit' }))).toMatchObject({ failure: { kind: 'error' } });
  });

  it('records the SDK authentication_failed cause as auth_error', () => {
    expect(judgeResult(session({ isError: true, cause: 'authentication_failed', text: 'Invalid credentials' }))).toMatchObject({ failure: { kind: 'auth_error' } });
  });

  it('fails an error subtype with no text by naming the subtype', () => {
    expect(judgeResult(session({ isError: true, subtype: 'error_max_turns', text: '' }))).toEqual({
      ok: false,
      failure: { kind: 'error', message: 'The model session ended with error_max_turns' },
    });
  });
});

describe('countToolCalls', () => {
  it('keeps names and counts only', () => {
    expect(countToolCalls(['mcp__esta__household_info', 'Read', 'mcp__esta__household_info'])).toEqual({
      mcp__esta__household_info: 2,
      Read: 1,
    });
  });
});
