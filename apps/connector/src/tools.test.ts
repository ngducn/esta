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
  it('offers the four read tools', async () => {
    const { client } = await connect('signed_out');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(['find_property', 'get_property', 'list_properties', 'resolve_address']);
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

  it('rejects arguments outside the schema before reading the session', async () => {
    const { client, logs } = await connect('signed_out');
    const result = await client.callTool({ name: 'get_property', arguments: { id: 'not-a-uuid' } });
    expect(result.isError).toBe(true);
    expect(logs).toEqual([]);
  });
});
