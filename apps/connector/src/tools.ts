import { DOCUMENT_CATEGORY_IDS, MAX_DOCUMENT_BYTES } from '@esta/core/documents';
import { formatVnd } from '@esta/core/format';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { LEASE_DEFAULTS } from '@esta/core/lease';
import { leaseDraftSchema } from '@esta/core/schemas/lease';
import { KIND_DETAIL_KEYS, propertyInputSchema } from '@esta/core/schemas/property';
import { unitSchema } from '@esta/core/schemas/units';
import type { Result } from '@esta/core/result';
import {
  applyPlan,
  findPerson,
  findProperty,
  getLease,
  getProperty,
  idSchema,
  listLeases,
  listProperties,
  MAX_ITEMS,
  OP_KINDS,
  personQuerySchema,
  planChanges,
  planRequestSchema,
  PLAN_TTL_MINUTES,
  suggestCurrentUnits,
  type Db,
  type LocalContext,
  type ReadContext,
} from '@esta/ops';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ImportFolders } from './files';
import type { OperatorRefusal } from './session';
import { MAX_SPREADSHEET_BYTES, readSpreadsheet } from './spreadsheet';

/** `batchDb` is Ryan's session tagged with one batch, for the writes `apply_plan` makes. */
export type ToolContext = LocalContext & ReadContext & { readonly folders: ImportFolders; readonly batchDb: (batchId: string) => Db };

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
const unitJsonSchema = JSON.stringify(z.toJSONSchema(unitSchema, { io: 'input', unrepresentable: 'any' }));
const leaseJsonSchema = JSON.stringify(z.toJSONSchema(leaseDraftSchema, { io: 'input', unrepresentable: 'any' }));
const leaseDefaults = Object.entries(LEASE_DEFAULTS)
  .map(
    ([kind, terms]) =>
      `${kind}: billing_cycle_months ${terms.billingCycleMonths}, period_anchor ${terms.periodAnchor}, first_period_proration ${terms.firstPeriodProration}, utilities_mode ${terms.utilitiesMode}, tax_payer ${terms.taxPayer}, notice_days ${terms.noticeDays}, deposit ${terms.depositMonths} months of rent`,
  )
  .join('; ');
const detailKeys = Object.entries(KIND_DETAIL_KEYS)
  .filter(([, keys]) => keys.length > 0)
  .map(([kind, keys]) => `${kind}: ${keys.join(', ')}`)
  .join('; ');

const ID_IN_NAME = 'A path whose name holds a full ID number is refused as id_number_in_name, since Esta never stores one; ask Ryan to rename the file or folder.';

const PLAN_DESCRIPTION = `Plan changes to Esta for Ryan to approve; nothing is written until apply_plan. Items run in order. Kinds: ${OP_KINDS.join(', ')}.
- property.create: input { property }. Esta mints the new property's id; never send one.
- property.edit: input { id, set } where set holds only the fields to change, with the keys and rules of property below; the rest keep their stored values, and the change lists only the fields that differ.
- document.attach: input { path, property_id, category, title, lease_id?, expires_on?, allow_duplicate? } files a JPEG, PNG, WebP or PDF of at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB from the import folders into the vault, as an upload there would. Categories: ${DOCUMENT_CATEGORY_IDS.join(', ')}. title is Vietnamese, as the vault titles it: the paper and the place, such as "Sổ hồng Bảo Lộc". property_id must name a property Esta already has: to file papers for a property created in this conversation, apply its plan first. A file already in the vault is refused as duplicate with the documents that hold it; set allow_duplicate only when Ryan wants a second copy. The change holds the file's size and SHA-256; apply sends it only if it is still the same file. ${ID_IN_NAME}
- unit.create: input { property_id, unit } adds a room, floor, shop or lot to a property, last in its list, as the rental tab does. property_id names a property Esta has, or one planned earlier in the batch by $ref. A label the property already has is refused as label_taken with the unit that holds it. unit is this JSON Schema: ${unitJsonSchema}
- person.create: input { person: { full_name, phone, id_last4 }, allow_duplicate? } adds a tenant. Call find_person first, and name a person Esta already has by id instead of creating them again. phone is null when Ryan gave none. id_last4 is only the last four digits of an ID number (CCCD), or null: never type the whole number. A person who may already be in Esta is refused as possible_duplicate with the people and what matched; set allow_duplicate: true only after Ryan says it is a different person.
- lease.create: input { lease, property_id? } saves a draft lease, as the lease form does. unit_id and tenant_party_id name a unit and a person Esta has, or ones planned earlier in the batch by $ref; give property_id when Ryan named the property, and a unit on another property is refused as other_property. Fill every term from LEASE_DEFAULTS below for the unit's kind unless Ryan said otherwise: deposit_vnd is rent_vnd times that kind's deposit months, escalation is { "kind": "none" } unless he named an increase, and end_date is null when the lease has no end. lease is this JSON Schema: ${leaseJsonSchema}
- lease.edit: input { id, set } changes a draft lease's terms; set holds only the terms to change, with the keys of lease above. A lease that is no longer a draft is refused as not_draft.
- lease.activate: input { lease_id, paid_through } starts a draft lease and issues the bills it owes today. paid_through is the last day the tenant has already paid for, or null: "đã thu đến 30/9" means paid_through "2026-09-30", and nothing up to that day is billed. Its preview lists the bills activation will write, issues_now marking those issued today; that preview is what Ryan approves, so show it to him with the change.
- deposit.record: input { lease_id, kind, amount_vnd, on_date, note } records a deposit received, deducted (note says what for) or refunded on a lease that is active, so plan it after the lease's activation. on_date is the day the money changed hands, no later than today. Its preview shows the amount, the day and what the lease holds after it.
LEASE_DEFAULTS by unit kind (a whole unit of an apartment takes the apartment terms): ${leaseDefaults}.
Refs: an item that creates a row may carry ref, a label you choose (a letter, then up to 39 letters, digits, - or _), and a later item writes { "$ref": "<label>" } wherever that row's id belongs, such as a unit's property_id. Only creates carry ref, and a $ref names only an earlier item. When an item is refused, at plan or at apply, every item that names it is refused as blocked and nothing of it is written.
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
    'list_leases',
    {
      description:
        "List the household's leases, or one property's: unit, property, tenant with a display phone, status, dates, rent and deposit with display strings, the paid-through date and the deposit held.",
      inputSchema: z.object({ property_id: idSchema.optional() }),
    },
    guarded('list_leases', deps, async (ctx, { property_id }: { property_id?: string | undefined }) => {
      const leases = await listLeases(ctx, property_id);
      return { data: { leases }, log: `count=${leases.length}` };
    }),
  );

  server.registerTool(
    'get_lease',
    {
      description:
        'Read one lease with every term, the deposit held, and its rent periods as the lease page plans them: each amount with a display string, whether the paid-through date covers it, and the invoice that bills it with its status.',
      inputSchema: z.object({ id: idSchema }),
    },
    guarded('get_lease', deps, async (ctx, { id }: { id: string }) => {
      const lease = await getLease(ctx, id);
      return lease === null ? { data: { error: 'not_found' }, log: 'count=0', isError: true } : { data: lease, log: 'count=1' };
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
    'find_person',
    {
      description:
        'Find people in the household (tenants, owners, companies) by name, phone or the last four digits of an ID number, at least one; each candidate says what matched. A name matches when it holds every word given, accents and case aside: give the name without anh, chị, cô or chú.',
      inputSchema: personQuerySchema,
    },
    guarded('find_person', deps, async (ctx, query: z.output<typeof personQuerySchema>) => {
      const found = await findPerson(ctx, query);
      return found.ok ? { data: { candidates: found.value }, log: `count=${found.value.length}` } : { data: { error: found.reason }, log: `refused=${found.reason}`, isError: true };
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
      description: `List one level of a folder Ryan set aside for Esta (~/Esta-import, or a folder he added): each entry's name and kind: a folder, a file with its size in bytes, or refused with the problem a read of it would meet, never its contents. A relative path starts at the first import folder. Read photos and PDFs yourself; read spreadsheets with read_spreadsheet. ${ID_IN_NAME}`,
      inputSchema: z.object({ path: z.string().trim().min(1).max(1000) }),
    },
    guarded('list_folder', deps, async (ctx, { path }: { path: string }) => {
      const listed = await ctx.folders.list(path);
      if (!listed.ok) return { data: listed.reason, log: `refused=${listed.reason.problem}`, isError: true };
      const refused = listed.value.filter((entry) => entry.kind === 'refused').length;
      return { data: { entries: listed.value }, log: `count=${listed.value.length} refused=${refused}` };
    }),
  );

  server.registerTool(
    'read_spreadsheet',
    {
      description: `Read an xlsx workbook or a CSV file from the import folders, every sheet row by row. Each cell is null or { type, text } with the type the sheet stored: text, number (exactly as written in the file), date (YYYY-MM-DD) or boolean; a CSV cell is always text. Turn a text amount such as "9tr" with parse_money and a text date such as "15/03/2026" with parse_date; never guess one. A sheet past ${MAX_SPREADSHEET_BYTES / 1024 / 1024} MB is refused, and one past 20,000 cells comes back with truncated: true. ${ID_IN_NAME}`,
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
      const applied = await applyPlan(ctx, plan_id, ctx.batchDb(plan_id));
      if (!applied.ok) return { data: applied.reason, log: `batch=${plan_id} reason=${applied.reason.kind}`, isError: true };
      const landed = applied.value.items.filter((item) => item.status === 'landed').length;
      return { data: applied.value, log: `batch=${plan_id} status=${applied.value.status} items=${applied.value.items.length} landed=${landed}` };
    }),
  );
}
