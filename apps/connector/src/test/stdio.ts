import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

/** A scripted MCP client for tests: starts the connector over stdio as Claude Code does, and keeps what it logs. */
export function stdioConnector(server: Omit<StdioServerParameters, 'stderr'>) {
  const transport = new StdioClientTransport({ ...server, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const client = new Client({ name: 'esta-connector-test', version: '0.0.0' });
  return { client, connect: () => client.connect(transport), stderr: () => stderr };
}

export async function call(connector: { readonly client: Client }, name: string, args: Record<string, unknown> = {}) {
  const result = await connector.client.callTool({ name, arguments: args });
  const text = z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(result.content)[0]?.text ?? '';
  return { isError: result.isError === true, text, json: (): unknown => JSON.parse(text) };
}
