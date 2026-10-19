import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEMO_PASSWORD } from '../../../supabase/seed/generator/households.ts';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { logIn } from './login';
import { connectorClient } from './session';
import { fileStore } from './store';

// `pnpm --filter @esta/connector test:integration` (scripts/connector-integration.ts) passes the slot's stack; run
// against a fresh `pnpm db:reset`. The server starts exactly as the README tells Claude Code to start it.
const env = z.object({ ESTA_SLOT: z.string(), ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1) }).parse(process.env);
const ROOT = join(import.meta.dirname, '..', '..', '..');
const OPERATOR = 'ryan.lane9@demo.esta.test';
const MEMBER = 'me.lane9@demo.esta.test';
const property = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);

const sessionFile = () => join(mkdtempSync(join(tmpdir(), 'esta-connector-it-')), 'session.json');
const storeAt = (file: string) => fileStore(env.ESTA_IT_SUPABASE_URL, file);

function signIn(email: string, file: string) {
  return logIn(connectorClient({ ESTA_SUPABASE_URL: env.ESTA_IT_SUPABASE_URL, ESTA_SUPABASE_ANON_KEY: env.ESTA_IT_ANON_KEY }, storeAt(file)), { email, password: DEMO_PASSWORD });
}

async function startConnector(file: string) {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['--silent', '--dir', ROOT, 'connector'],
    env: { ESTA_SLOT: env.ESTA_SLOT, ESTA_SESSION_FILE: file },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const client = new Client({ name: 'connector-integration', version: '0.0.0' });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

type Connector = Awaited<ReturnType<typeof startConnector>>;

async function call(connector: Connector, name: string, args: Record<string, unknown> = {}) {
  const result = await connector.client.callTool({ name, arguments: args });
  const text = z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(result.content)[0]?.text ?? '';
  return { isError: result.isError === true, text, json: (): unknown => JSON.parse(text) };
}

const candidatesSchema = z.object({ candidates: z.array(z.object({ id: z.string(), reasons: z.array(z.string()) })) });

describe('the connector over stdio, signed in as the household operator', () => {
  const file = sessionFile();
  let connector: Connector;

  beforeAll(async () => {
    const signedIn = await signIn(OPERATOR, file);
    expect(signedIn).toMatchObject({ ok: true, value: { householdName: 'Gia đình Demo 9' } });
    connector = await startConnector(file);
  }, 60_000);

  afterAll(async () => {
    await connector.client.close();
  });

  it('keeps the session in a file only its owner can read', () => {
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('offers the four read tools', async () => {
    const { tools } = await connector.client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(['find_property', 'get_property', 'list_properties', 'resolve_address']);
  });

  it("lists the household's properties and no other household's", async () => {
    const listed = z.object({ properties: z.array(z.object({ id: z.string(), nickname: z.string() })) }).parse((await call(connector, 'list_properties')).json()).properties;
    const ids = listed.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([property(9, 'bao-loc'), property(9, 'q7'), property(9, 'di-an')]));
    expect(ids).not.toContain(property(8, 'bao-loc'));
  });

  it('shows an amount in the kind details beside its display string', async () => {
    const { kindDetails } = z.object({ kindDetails: z.record(z.string(), z.unknown()) }).parse((await call(connector, 'get_property', { id: property(9, 'thu-duc') })).json());
    expect(kindDetails).toMatchObject({ management_fee_vnd: 1_200_000, management_fee_vnd_display: formatVnd(vnd(1_200_000), 'vi') });
  });

  it('finds a property by nickname without diacritics, and by its exact code first', async () => {
    const byName = candidatesSchema.parse((await call(connector, 'find_property', { text: 'bao loc' })).json()).candidates;
    expect(byName[0]).toEqual({ id: property(9, 'bao-loc'), nickname: 'Đất Bảo Lộc', code: 'BAOLOC', address: expect.any(String), reasons: ['nickname'] });
    const byCode = candidatesSchema.parse((await call(connector, 'find_property', { text: 'dian' })).json()).candidates;
    expect(byCode[0]).toMatchObject({ id: property(9, 'di-an'), reasons: ['code'] });
  });

  it("reads one property, and refuses another household's property as not found", async () => {
    const own = z.object({ id: z.string(), nickname: z.string(), unitCount: z.number() }).parse((await call(connector, 'get_property', { id: property(9, 'di-an') })).json());
    expect(own).toMatchObject({ nickname: 'Dãy trọ Dĩ An', unitCount: 8 });
    const foreign = await call(connector, 'get_property', { id: property(8, 'di-an') });
    expect(foreign).toMatchObject({ isError: true, text: '{"error":"not_found"}' });
  });

  it('maps "Dĩ An, Bình Dương" to its current ward under TP. Hồ Chí Minh (PRP-4)', async () => {
    const { suggestions } = z.object({ suggestions: z.array(z.object({ provinceCode: z.string(), matchedLegacyName: z.string() })) }).parse((await call(connector, 'resolve_address', { text: 'Dĩ An, Bình Dương' })).json());
    expect(suggestions[0]?.provinceCode).toBe('79');
  });

  it('logs tool names and counts to stderr, never what the tools returned', () => {
    const log = connector.stderr();
    expect(log).toContain('[connector] find_property count=');
    expect(log).toContain('[connector] list_properties count=');
    expect(log).not.toContain('Bảo Lộc');
    expect(log).not.toContain('refresh_token');
  });
});

describe('the connector for anyone but the operator', () => {
  it('signs a member who is not the operator out again at sign-in, leaving no session behind', async () => {
    const file = sessionFile();
    expect(await signIn(MEMBER, file)).toEqual({ ok: false, reason: 'not_operator' });
    expect(existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8'))) : []).toEqual([]);
  });

  it('refuses every tool before anyone signs in, and says how to sign in', async () => {
    const connector = await startConnector(sessionFile());
    const refused = await call(connector, 'list_properties');
    await connector.client.close();
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('pnpm connector:login');
  }, 60_000);
});
