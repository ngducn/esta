import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { call, clientAt, env, sessionFiles, signIn, startConnector, storeAt } from './test/connector';
import { logOut } from './logout';

const OPERATOR = 'ryan.lane2@demo.esta.test';
const sessions = sessionFiles();
afterAll(() => sessions.discard());

const accessToken = (file: string): string => {
  const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const session = JSON.parse(Object.values(stored)[0] ?? '{}') as { access_token?: string };
  return session.access_token ?? '';
};
const headers = (token: string) => ({ apikey: env.ESTA_IT_ANON_KEY, authorization: `Bearer ${token}` });
const refreshTokenOf = (file: string): string => {
  const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  return (JSON.parse(Object.values(stored)[0] ?? '{}') as { refresh_token?: string }).refresh_token ?? '';
};
const refreshes = async (refreshToken: string) =>
  (
    await fetch(`${env.ESTA_IT_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: env.ESTA_IT_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  ).ok;
const authApiAccepts = async (token: string) =>
  (await fetch(`${env.ESTA_IT_SUPABASE_URL}/auth/v1/user`, { headers: headers(token) })).ok;
const dataApiReads = async (token: string) =>
  (await fetch(`${env.ESTA_IT_SUPABASE_URL}/rest/v1/properties?select=id&limit=1`, { headers: headers(token) })).ok;

describe('signing out of the connector (#220)', { timeout: 60_000 }, () => {
  it('ends the session on the server: the refresh token and the Auth API refuse it at once, but a copied access token still reads the data API until it expires', async () => {
    const file = sessions.make();
    expect(await signIn(OPERATOR, file)).toMatchObject({ ok: true });
    const token = accessToken(file);
    const refreshToken = refreshTokenOf(file);
    expect(await authApiAccepts(token), 'the access token works while signed in').toBe(true);
    expect(await dataApiReads(token)).toBe(true);

    expect(await logOut(clientAt(file), storeAt(file))).toEqual({ ok: true, value: 'signed_out' });

    expect(await authApiAccepts(token), 'the Auth API refuses the token, so every connector tool call (getUser) stops').toBe(false);
    expect(await refreshes(refreshToken), 'the refresh token cannot mint a new access token').toBe(false);
    expect(await dataApiReads(token), 'known limit: the data API checks the signed token, not the session, until it expires (jwt_expiry)').toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({});
  });

  it('stops a running connector at its next call when the session is signed out from somewhere else', async () => {
    const running = sessions.make();
    const elsewhere = sessions.make();
    expect(await signIn(OPERATOR, running)).toMatchObject({ ok: true });
    expect(await signIn(OPERATOR, elsewhere)).toMatchObject({ ok: true });
    const connector = await startConnector(running);
    try {
      expect((await call(connector, 'list_properties')).isError, 'it reads while the session lives').toBe(false);
      expect((await clientAt(elsewhere).auth.signOut({ scope: 'global' })).error).toBeNull();
      const refused = await call(connector, 'list_properties');
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('pnpm connector:login');
    } finally {
      await connector.client.close();
    }
  });
});
