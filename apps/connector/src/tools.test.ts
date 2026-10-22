import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { OperatorRefusal } from './session';
import { registerTools } from './tools';

async function connect(refusal: OperatorRefusal) {
  const logs: string[] = [];
  const server = new McpServer({ name: 'esta', version: '0.0.0' });
  registerTools(server, { context: async () => ({ ok: false, reason: refusal }), log: (line) => logs.push(line) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, logs };
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) => (Array.isArray(result.content) ? result.content.map((part) => (part.type === 'text' ? part.text : '')).join('') : '');

describe('connector tools', () => {
  it('offers the read, file, parse and write tools', async () => {
    const { client } = await connect('signed_out');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
      'apply_plan',
      'find_person',
      'find_property',
      'get_lease',
      'get_property',
      'list_folder',
      'list_leases',
      'list_properties',
      'parse_date',
      'parse_money',
      'plan_changes',
      'read_spreadsheet',
      'resolve_address',
      'undo_batch',
    ]);
  });

  it('rejects a plan with an op Esta does not have before reading the session', async () => {
    const { client, logs } = await connect('signed_out');
    const result = await client.callTool({ name: 'plan_changes', arguments: { summary: 'Demo', items: [{ op: 'property.delete', input: {} }] } });
    expect(result.isError).toBe(true);
    expect(logs).toEqual([]);
  });

  it.each([
    ['signed_out', 'pnpm connector:login'],
    ['not_operator', 'Only the household operator'],
    ['no_household', 'belongs to no household'],
  ] as const)('refuses every tool when the session is %s, and says what to do', async (refusal, says) => {
    const { client, logs } = await connect(refusal);
    const result = await client.callTool({ name: 'find_property', arguments: { text: 'Demo Bảo Lộc' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(says);
    expect(logs).toEqual([`find_property refused=${refusal}`]);
  });

  it('rejects a person search with nothing to search by, or with a whole ID number, before reading the session', async () => {
    const { client, logs } = await connect('signed_out');
    expect((await client.callTool({ name: 'find_person', arguments: {} })).isError).toBe(true);
    expect((await client.callTool({ name: 'find_person', arguments: { id_last4: '079301004567' } })).isError).toBe(true);
    expect(logs).toEqual([]);
  });

  it('rejects arguments outside the schema before reading the session', async () => {
    const { client, logs } = await connect('signed_out');
    const result = await client.callTool({ name: 'get_property', arguments: { id: 'not-a-uuid' } });
    expect(result.isError).toBe(true);
    expect(logs).toEqual([]);
  });
});
