import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import connectorPackage from '../package.json' with { type: 'json' };
import { connectorClient, connectorEnvSchema, currentOperator } from './session';
import { secretStore } from './store';
import { registerTools } from './tools';

// stdout carries the MCP protocol, so every log line goes to stderr.
const env = connectorEnvSchema.parse(process.env);
const db = connectorClient(env, secretStore(env.ESTA_SUPABASE_URL, { platform: process.platform, file: env.ESTA_SESSION_FILE }));
const server = new McpServer({ name: 'esta', version: connectorPackage.version });

registerTools(server, {
  async context() {
    const operator = await currentOperator(db);
    return operator.ok ? { ok: true, value: { db, householdId: operator.value.householdId, locale: operator.value.locale } } : operator;
  },
  log: (line) => console.error(`[connector] ${line}`),
});

await server.connect(new StdioServerTransport());
console.error(`[connector] ready for ${env.ESTA_SUPABASE_URL}`);
