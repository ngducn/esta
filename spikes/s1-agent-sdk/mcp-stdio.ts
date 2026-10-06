import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'esta', version: '0.0.0' });

server.registerTool(
  'household_info',
  { description: 'Return basic facts about the current household.' },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ name: 'Gia đình Demo', member_count: 2, property_count: 7, locale: 'vi' }),
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
