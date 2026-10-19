import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:59999';

it('answers a session file cut off mid-write with "sign in again", and never prints the file', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
  const session = JSON.stringify({ access_token: 'FAKE-ACCESS-demo-token', refresh_token: 'FAKE-REFRESH-demo-token', expires_at: 4_102_444_800 });
  writeFileSync(file, JSON.stringify({ [`${SUPABASE_URL}#session`]: session }).slice(0, -20), { mode: 0o600 });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', join(import.meta.dirname, 'main.ts')],
    cwd: join(import.meta.dirname, '..'),
    env: { ESTA_SUPABASE_URL: SUPABASE_URL, ESTA_SUPABASE_ANON_KEY: 'demo-anon-key', ESTA_SESSION_FILE: file },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const client = new Client({ name: 'connector-session-file', version: '0.0.0' });
  const result = await client
    .connect(transport)
    .then(async () => client.callTool({ name: 'list_properties', arguments: {} }))
    .catch((error: unknown) => ({ error }));
  await client.close();

  expect(stderr).not.toContain('FAKE-');
  expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('pnpm connector:login') }] });
}, 30_000);
