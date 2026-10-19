import { DOCUMENT_CATEGORY_IDS, MAX_DOCUMENT_BYTES } from '@esta/core/documents';
import { formatVnd } from '@esta/core/format';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { KIND_DETAIL_KEYS, propertyInputSchema } from '@esta/core/schemas/property';
import type { Result } from '@esta/core/result';
import {
  applyPlan,
  findProperty,
  getProperty,
  idSchema,
  listProperties,
  MAX_ITEMS,
  OP_KINDS,
  planChanges,
  planRequestSchema,
  PLAN_TTL_MINUTES,
  suggestCurrentUnits,
  type LocalContext,
  type ReadContext,
} from '@esta/ops';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ImportFolders } from './files';
import type { OperatorRefusal } from './session';
import { MAX_SPREADSHEET_BYTES, readSpreadsheet } from './spreadsheet';

export type ToolContext = LocalContext & ReadContext & { readonly folders: ImportFolders };

export type ToolDeps = {
  /** Checked on every call: the session, its household, and that the member is still its operator. */
  context(): Promise<Result<ToolContext, OperatorRefusal>>;
  /** Tool names, batch ids and counts only (CONNECTOR §6), never a payload. */
  log(line: string): void;
};

type Reply = { readonly data: unknown; readonly log: string; readonly isError?: boolean };

const SIGN_IN: Record<OperatorRefusal, string> = {
  signed_out: 'The connector is not signed in to Esta. Ask Ryan to run `pnpm connector:login` in the Esta repo.',
  no_household: 'This Esta account belongs to no household yet.',
  not_operator: 'Only the household operator can use the Esta connector.',
};

function guarded<A>(name: string, deps: ToolDeps, handler: (ctx: ToolContext, args: A) => Promise<Reply>) {
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

const propertySchema = JSON.stringify(z.toJSONSchema(propertyInputSchema, { io: 'input', unrepresentable: 'any' }));
const detailKeys = Object.entries(KIND_DETAIL_KEYS)
  .filter(([, keys]) => keys.length > 0)
  .map(([kind, keys]) => `${kind}: ${keys.join(', ')}`)
  .join('; ');

const PLAN_DESCRIPTION = `Plan changes to Esta for Ryan to approve; nothing is written until apply_plan. Items run in order. Kinds: ${OP_KINDS.join(', ')}.
- property.create: input { property }. Esta mints the new property's id; never send one.
- property.edit: input { id, set } where set holds only the fields to change, with the keys and rules of property below; the rest keep their stored values, and the change lists only the fields that differ.
- document.attach: input { path, property_id, category, title, lease_id?, expires_on?, allow_duplicate? } files a JPEG, PNG, WebP or PDF of at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB from the import folders into the vault, as an upload there would. Categories: ${DOCUMENT_CATEGORY_IDS.join(', ')}. title is Vietnamese, as the vault titles it: the paper and the place, such as "Sổ hồng Bảo Lộc". property_id must name a property Esta already has: to file papers for a property created in this conversation, apply its plan first. A file already in the vault is refused as duplicate with the documents that hold it; set allow_duplicate only when Ryan wants a second copy. The change holds the file's size and SHA-256; apply sends it only if it is still the same file.
property is this JSON Schema: ${propertySchema}
kind_details keys by kind (others take {}): ${detailKeys}. Amounts are whole đồng. current_address codes come from resolve_address.
Returns each item's change (or unchanged, or a refusal). When nothing is refused it stores the plan and returns plan_id; show Ryan a short Vietnamese summary of every change and call apply_plan only after he says OK. A plan expires ${PLAN_TTL_MINUTES} minutes after planning. At most ${MAX_ITEMS} items.`;

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
    { description: 'Read one property as its detail page shows it, with its kind details; every amount comes with a display string.', inputSchema: z.object({ id: idSchema }) },
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

  server.registerTool(
    'list_folder',
    {
      description: `List one level of a folder Ryan set aside for Esta (~/Esta-import, or a folder he added): each entry's name, kind (folder, file or other) and file size in bytes, never its contents. A relative path starts at the first import folder. Read photos and PDFs yourself; read spreadsheets with read_spreadsheet.`,
      inputSchema: z.object({ path: z.string().trim().min(1).max(1000) }),
    },
    guarded('list_folder', deps, async (ctx, { path }: { path: string }) => {
      const listed = await ctx.folders.list(path);
      return listed.ok ? { data: { entries: listed.value }, log: `count=${listed.value.length}` } : { data: listed.reason, log: `refused=${listed.reason.problem}`, isError: true };
    }),
  );

  server.registerTool(
    'read_spreadsheet',
    {
      description: `Read an xlsx workbook or a CSV file from the import folders, every sheet row by row. Each cell is null or { type, text } with the type the sheet stored: text, number (exactly as written in the file), date (YYYY-MM-DD) or boolean; a CSV cell is always text. Turn a text amount such as "9tr" with parse_money and a text date such as "15/03/2026" with parse_date; never guess one. A sheet past ${MAX_SPREADSHEET_BYTES / 1024 / 1024} MB is refused, and one past 20,000 cells comes back with truncated: true.`,
      inputSchema: z.object({ path: z.string().trim().min(1).max(1000) }),
    },
    guarded('read_spreadsheet', deps, async (ctx, { path }: { path: string }) => {
      const read = await ctx.folders.read(path, MAX_SPREADSHEET_BYTES);
      if (!read.ok) return { data: read.reason, log: `refused=${read.reason.problem}`, isError: true };
      const sheets = await readSpreadsheet(read.value);
      if (!sheets.ok) return { data: { kind: 'file', problem: sheets.reason }, log: `refused=${sheets.reason}`, isError: true };
      return { data: { sheets: sheets.value }, log: `sheets=${sheets.value.length} rows=${sheets.value.reduce((rows, sheet) => rows + sheet.rows.length, 0)}` };
    }),
  );

  server.registerTool(
    'parse_money',
    {
      description: 'Read an amount as Vietnamese people write it ("9tr", "3,2 tỷ", "1.200.000đ", "850k") into whole đồng with Esta\'s own parser, with a display string. Refuses an ambiguous amount instead of guessing.',
      inputSchema: z.object({ text: z.string().trim().min(1).max(100) }),
    },
    guarded('parse_money', deps, async (ctx, { text }: { text: string }) => {
      const parsed = parseVndInput(text);
      return parsed.ok
        ? { data: { vnd: parsed.value, vnd_display: formatVnd(parsed.value, ctx.locale) }, log: 'parsed=1' }
        : { data: { error: parsed.reason }, log: `refused=${parsed.reason}`, isError: true };
    }),
  );

  server.registerTool(
    'parse_date',
    {
      description: 'Read a date written day first, as in Vietnam ("15/03/2026", "1-3-2026"), into YYYY-MM-DD with Esta\'s own parser. Refuses a date without a year or one that does not exist.',
      inputSchema: z.object({ text: z.string().trim().min(1).max(40) }),
    },
    guarded('parse_date', deps, async (_ctx, { text }: { text: string }) => {
      const parsed = parseDateInput(text);
      return parsed.ok ? { data: { date: parsed.value }, log: 'parsed=1' } : { data: { error: parsed.reason }, log: `refused=${parsed.reason}`, isError: true };
    }),
  );

  server.registerTool(
    'plan_changes',
    { description: PLAN_DESCRIPTION, inputSchema: planRequestSchema },
    guarded('plan_changes', deps, async (ctx, request: z.output<typeof planRequestSchema>) => {
      const planned = await planChanges(ctx, request);
      if (planned.ok) return { data: planned.value, log: `batch=${planned.value.planId} items=${planned.value.items.length}` };
      const refused = planned.reason.kind === 'items_refused' ? planned.reason.items.filter((item) => item.status === 'refused').length : 0;
      return { data: planned.reason, log: `items=${request.items.length} refused=${refused} reason=${planned.reason.kind}`, isError: true };
    }),
  );

  server.registerTool(
    'apply_plan',
    {
      description:
        'Apply a stored plan after Ryan said OK. Each item is checked again; an item whose change is no longer what Ryan saw is refused as stale and nothing of it is written. Ends applied or partial with every outcome. in_progress means an earlier apply was cut off: call again at retryAt and it finishes the batch, landing nothing twice.',
      inputSchema: z.object({ plan_id: idSchema }),
    },
    guarded('apply_plan', deps, async (ctx, { plan_id }: { plan_id: string }) => {
      const applied = await applyPlan(ctx, plan_id);
      if (!applied.ok) return { data: applied.reason, log: `batch=${plan_id} reason=${applied.reason.kind}`, isError: true };
      const landed = applied.value.items.filter((item) => item.status === 'landed').length;
      return { data: applied.value, log: `batch=${plan_id} status=${applied.value.status} items=${applied.value.items.length} landed=${landed}` };
    }),
  );
}
