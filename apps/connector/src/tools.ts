import type { Result } from '@esta/core/result';
import { findProperty, getProperty, listProperties, suggestCurrentUnits, type ReadContext } from '@esta/ops';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { OperatorRefusal } from './session';

export type ToolDeps = {
  /** Checked on every call: the session, its household, and that the member is still its operator. */
  context(): Promise<Result<ReadContext, OperatorRefusal>>;
  /** Tool names and counts only (CONNECTOR §6), never a payload. */
  log(line: string): void;
};

type Reply = { readonly data: unknown; readonly log: string; readonly isError?: boolean };

const SIGN_IN: Record<OperatorRefusal, string> = {
  signed_out: 'The connector is not signed in to Esta. Ask Ryan to run `pnpm connector:login` in the Esta repo.',
  no_household: 'This Esta account belongs to no household yet.',
  not_operator: 'Only the household operator can use the Esta connector.',
};

function guarded<A>(name: string, deps: ToolDeps, handler: (ctx: ReadContext, args: A) => Promise<Reply>) {
  return async (args: A): Promise<CallToolResult> => {
    const ctx = await deps.context();
    if (!ctx.ok) {
      deps.log(`${name} refused=${ctx.reason}`);
      return { isError: true, content: [{ type: 'text', text: SIGN_IN[ctx.reason] }] };
    }
    const reply = await handler(ctx.value, args);
    deps.log(`${name} ${reply.log}`);
    return { ...(reply.isError ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify(reply.data) }] };
  };
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_properties',
    { description: "List the household's properties with their kind, use, legal status, current and certificate address, and unit count.", inputSchema: z.object({}) },
    guarded('list_properties', deps, async (ctx) => {
      const properties = await listProperties(ctx);
      return { data: { properties }, log: `count=${properties.length}` };
    }),
  );

  server.registerTool(
    'get_property',
    { description: 'Read one property as its detail page shows it, with its kind details; every amount comes with a display string.', inputSchema: z.object({ id: z.uuid() }) },
    guarded('get_property', deps, async (ctx, { id }: { id: string }) => {
      const property = await getProperty(ctx, id);
      return property === null ? { data: { error: 'not_found' }, log: 'count=0', isError: true } : { data: property, log: 'count=1' };
    }),
  );

  server.registerTool(
    'find_property',
    {
      description: 'Find properties by nickname, code, current address, certificate address or the pre-2025 ward, district and province names; each candidate says what matched.',
      inputSchema: z.object({ text: z.string().trim().min(1).max(200) }),
    },
    guarded('find_property', deps, async (ctx, { text }: { text: string }) => {
      const candidates = await findProperty(ctx, text);
      return { data: { candidates }, log: `count=${candidates.length}` };
    }),
  );

  server.registerTool(
    'resolve_address',
    {
      description:
        'Map an address as Vietnamese people write it, old names included ("Phường 1, Quận 7, TP.HCM"), to the current ward and province codes, best first. partial means the old ward was split.',
      inputSchema: z.object({ text: z.string().trim().min(3).max(300) }),
    },
    guarded('resolve_address', deps, async (ctx, { text }: { text: string }) => {
      const suggestions = await suggestCurrentUnits(ctx.db, text);
      return { data: { suggestions }, log: `count=${suggestions.length}` };
    }),
  );
}
