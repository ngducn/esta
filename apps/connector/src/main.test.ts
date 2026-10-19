import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { stdioConnector } from './test/stdio';

const SUPABASE_URL = 'http://127.0.0.1:59999';

it('answers a session file cut off mid-write with "sign in again", and never prints the file', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
  const session = JSON.stringify({ access_token: 'FAKE-ACCESS-demo-token', refresh_token: 'FAKE-REFRESH-demo-token', expires_at: 4_102_444_800 });
  writeFileSync(file, JSON.stringify({ [`${SUPABASE_URL}#session`]: session }).slice(0, -20), { mode: 0o600 });

  const connector = stdioConnector({
    command: process.execPath,
    args: ['--import', 'tsx', join(import.meta.dirname, 'main.ts')],
    cwd: join(import.meta.dirname, '..'),
    env: { ESTA_SUPABASE_URL: SUPABASE_URL, ESTA_SUPABASE_ANON_KEY: 'demo-anon-key', ESTA_SESSION_FILE: file },
  });
  const result = await connector
    .connect()
    .then(async () => connector.client.callTool({ name: 'list_properties', arguments: {} }))
    .catch((error: unknown) => ({ error }));
  await connector.client.close();

  expect(connector.stderr()).not.toContain('FAKE-');
  expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('pnpm connector:login') }] });
}, 30_000);
