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

/** An answer the model reads and acts on, such as a validation error. Any other error a tool throws fails the job. */
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

/** Runs one call in live and replay alike: the answer or a rejection is text for the model, and any other error propagates. */
export async function runTool(estaTool: EstaTool, input: Record<string, unknown>): Promise<{ readonly text: string; readonly isError: boolean }> {
  try {
    return { text: JSON.stringify(await estaTool.run(input)), isError: false };
  } catch (error) {
    if (error instanceof ToolRejection) return { text: error.message, isError: true };
    throw error;
  }
}

/** The MCP server hands a thrown error back to the model as text, so a job failure also goes to `fail` for the caller to end the session. */
export function estaServer(tools: EstaTools, fail: (error: unknown) => void): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '1.0.0',
    alwaysLoad: true,
    tools: [...tools.values()].map((estaTool) =>
      tool(estaTool.name, estaTool.description, CATALOG[estaTool.name].input, async (args: Record<string, unknown>) => {
        try {
          const { text, isError } = await runTool(estaTool, args);
          return { content: [{ type: 'text' as const, text }], isError };
        } catch (error) {
          fail(error);
          throw error;
        }
      }),
    ),
  });
}
