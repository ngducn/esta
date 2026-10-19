import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

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
