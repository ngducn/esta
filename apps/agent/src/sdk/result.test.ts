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
