import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { logOut } from './logout';
import { connectorClient, currentOperator, STORAGE_KEY } from './session';
import { fileStore } from './store';

const DEAD_URL = 'http://127.0.0.1:1';
const session = {
  access_token: 'demo-access-token',
  refresh_token: 'demo-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'demo-user', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' },
};

function signedIn(url: string, withSession = true) {
  const file = join(mkdtempSync(join(tmpdir(), 'esta-logout-')), 'session.json');
  const store = fileStore(url, file);
  if (withSession) store.setItem(STORAGE_KEY, JSON.stringify(session));
  const db = connectorClient({ ESTA_SUPABASE_URL: url, ESTA_SUPABASE_ANON_KEY: 'demo-anon-key' }, store);
  return { db, store, file };
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});
async function authServer(status: number): Promise<string> {
  const server = createServer((_request, response) => {
    response.statusCode = status;
    response.end('{}');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
}

describe('logOut (#220)', () => {
  it('keeps the saved session and reports unreachable when Esta cannot be reached', async () => {
    const { db, store, file } = signedIn(DEAD_URL);
    expect(await logOut(db, store)).toEqual({ ok: false, reason: 'unreachable' });
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
    expect(readFileSync(file, 'utf8')).toContain('demo-refresh-token');
    expect(await logOut(db, store)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('keeps the saved session when the server answers with an error of its own', async () => {
    const { db, store } = signedIn(await authServer(503));
    expect(await logOut(db, store)).toEqual({ ok: false, reason: 'unreachable' });
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('removes the saved session once the server ended it', async () => {
    const { db, store } = signedIn(await authServer(204));
    expect(await logOut(db, store)).toEqual({ ok: true, value: 'signed_out' });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('removes a session the server no longer knows, since there is nothing left to end', async () => {
    const { db, store } = signedIn(await authServer(401));
    expect(await logOut(db, store)).toEqual({ ok: true, value: 'signed_out' });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('says nothing was saved, without calling the server', async () => {
    const { db, store } = signedIn(DEAD_URL, false);
    expect(await logOut(db, store)).toEqual({ ok: true, value: 'nothing_saved' });
  });
});

describe('currentOperator while Esta is down (#220)', () => {
  it('says Esta is unreachable, not that the connector is signed out, and keeps the saved session', async () => {
    const { db, store } = signedIn(DEAD_URL);
    expect(await currentOperator(db)).toEqual({ ok: false, reason: 'unreachable' });
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('still says signed out when no session is saved', async () => {
    const { db } = signedIn(DEAD_URL, false);
    expect(await currentOperator(db)).toEqual({ ok: false, reason: 'signed_out' });
  });
});
