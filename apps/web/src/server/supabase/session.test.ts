import { describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE_SECONDS, sessionCookie } from './session';

describe('sessionCookie', () => {
  it('caps the 400-day cookie @supabase/ssr writes at 30 days', () => {
    expect(sessionCookie({ path: '/', maxAge: 400 * 86_400 })).toEqual({ path: '/', maxAge: SESSION_MAX_AGE_SECONDS });
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 86_400);
  });

  it('leaves a removal as a removal', () => {
    expect(sessionCookie({ path: '/', maxAge: 0 })).toEqual({ path: '/', maxAge: 0 });
  });
});
