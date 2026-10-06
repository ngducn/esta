import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE_SECONDS, sessionCookie } from './session';

describe('sessionCookie', () => {
  const http = new Headers({ 'x-forwarded-proto': 'http' });

  it('caps the 400-day cookie @supabase/ssr writes at 30 days', () => {
    expect(sessionCookie({ path: '/', maxAge: 400 * 86_400 }, http).maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 86_400);
  });

  it('leaves a removal as a removal', () => {
    expect(sessionCookie({ path: '/', maxAge: 0 }, http).maxAge).toBe(0);
  });

  it('keeps the cookie from scripts, and sends it only over https when the request came over https', () => {
    expect(sessionCookie({ path: '/', httpOnly: false }, http)).toMatchObject({ httpOnly: true, secure: false });
    expect(sessionCookie({ path: '/' }, new Headers())).toMatchObject({ httpOnly: true, secure: false });
    expect(sessionCookie({ path: '/' }, new Headers({ 'x-forwarded-proto': 'https' }))).toMatchObject({
      httpOnly: true,
      secure: true,
    });
    expect(sessionCookie({ path: '/' }, new Headers({ 'x-forwarded-proto': 'https, http' })).secure).toBe(true);
  });

  it('matches the auth server session timebox in supabase/config.toml', () => {
    const toml = readFileSync(new URL('../../../../../supabase/config.toml', import.meta.url), 'utf8');
    const hours = /^\[auth\.sessions\]\ntimebox = "(\d+)h"$/m.exec(toml)?.[1];
    expect(Number(hours) * 3600).toBe(SESSION_MAX_AGE_SECONDS);
  });
});
