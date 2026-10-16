import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDb } from '../supabase';
import { householdInfo } from './household-info';

export const SERVER_NAME = 'esta';

export const mcpToolName = (name: string): string => `mcp__${SERVER_NAME}__${name}`;

export type EstaTool = { readonly name: string; readonly description: string; run(): Promise<unknown> };

const CATALOG = {
  household_info: {
    description: 'Return the household name, member count, property count and locale.',
    build: (db: AgentDb, householdId: string) => () => householdInfo(db, householdId),
  },
} as const;

export type EstaToolName = keyof typeof CATALOG;

export function isEstaToolName(name: string): name is EstaToolName {
  return Object.hasOwn(CATALOG, name);
}

/** Every tool closes over the job's household, so a model cannot ask about another one (AGENT.md §4). */
export function buildTools(db: AgentDb, householdId: string, names: readonly EstaToolName[]): ReadonlyMap<string, EstaTool> {
  return new Map(
    names.map((name) => [mcpToolName(name), { name, description: CATALOG[name].description, run: CATALOG[name].build(db, householdId) }]),
  );
}

export function estaServer(tools: ReadonlyMap<string, EstaTool>): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '1.0.0',
    alwaysLoad: true,
    tools: [...tools.values()].map((estaTool) =>
      tool(estaTool.name, estaTool.description, {}, async () => ({
        content: [{ type: 'text', text: JSON.stringify(await estaTool.run()) }],
      })),
    ),
  });
}
