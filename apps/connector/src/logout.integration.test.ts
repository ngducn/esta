import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { call, clientAt, env, sessionFiles, signIn, startConnector } from './test/connector';
import { logOut } from './logout';

const OPERATOR = 'ryan.lane2@demo.esta.test';
const sessions = sessionFiles();
afterAll(() => sessions.discard());

const accessToken = (file: string): string => {
  const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const session = JSON.parse(Object.values(stored)[0] ?? '{}') as { access_token?: string };
  return session.access_token ?? '';
};
const serverAccepts = async (token: string) =>
  (await fetch(`${env.ESTA_IT_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.ESTA_IT_ANON_KEY, authorization: `Bearer ${token}` } })).ok;

describe('signing out of the connector (#220)', () => {
  it('ends the session on the server, so the saved access token stops working at once', async () => {
    const file = sessions.make();
    expect(await signIn(OPERATOR, file)).toMatchObject({ ok: true });
    const token = accessToken(file);
    expect(await serverAccepts(token), 'the access token works while signed in').toBe(true);

    expect(await logOut(clientAt(file))).toEqual({ ok: true, value: null });

    expect(await serverAccepts(token), 'the server session is gone, not just the saved copy').toBe(false);
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
  }, 60_000);
});
