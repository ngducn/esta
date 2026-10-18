import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const SERVER_NAME = 'esta';

export const mcpToolName = (name: string): string => `mcp__${SERVER_NAME}__${name}`;

/** Esta's tools as the model sees them. A job's `prepare` binds each to the job's household (AGENT.md §4). */
const CATALOG = {
  household_info: {
    description: 'Return the household name, member count, property count and locale.',
    input: {},
  },
  save_extraction: {
    description:
      'Save the JSON you read from the document, as {"result": <the object>}. It answers {"saved": true}, or lists the fields to fix before you call it again.',
    input: { result: z.record(z.string(), z.unknown()) },
  },
} as const;

export type EstaToolName = keyof typeof CATALOG;

export function isEstaToolName(name: string): name is EstaToolName {
  return Object.hasOwn(CATALOG, name);
}

/** An answer the model reads and acts on, such as a validation error, rather than a failure of the job. */
export class ToolRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRejection';
  }
}

export type EstaTool = {
  readonly name: EstaToolName;
  readonly description: string;
  run(input: Record<string, unknown>): Promise<unknown>;
};

export type EstaTools = ReadonlyMap<string, EstaTool>;

export function estaTool(name: EstaToolName, run: (input: Record<string, unknown>) => Promise<unknown>): readonly [string, EstaTool] {
  return [mcpToolName(name), { name, description: CATALOG[name].description, run }];
}

export function estaServer(tools: EstaTools): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '1.0.0',
    alwaysLoad: true,
    tools: [...tools.values()].map((estaTool) =>
      tool(estaTool.name, estaTool.description, CATALOG[estaTool.name].input, async (args: Record<string, unknown>) => {
        try {
          return { content: [{ type: 'text' as const, text: JSON.stringify(await estaTool.run(args)) }] };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
      }),
    ),
  });
}
