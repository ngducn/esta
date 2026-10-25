import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const SERVER_NAME = 'esta';

export const mcpToolName = (name: string): string => `mcp__${SERVER_NAME}__${name}`;

const briefLine = z.object({ text: z.string(), related: z.array(z.string()) });

/** Esta's tools as the model sees them. A job's `prepare` binds each to the job's household (AGENT.md §4). */
const CATALOG = {
  household_info: {
    description: 'Return the household name, member count, property count and locale.',
    input: {},
  },
  watch_facts: {
    description:
      "Return today's facts from the watch rules. Each fact has a handle (f1, f2, …), a rule_id, a severity (action, watch or info), names and figures as text fields to cite as {{fN.field}}.",
    input: {},
  },
  create_item: {
    description:
      'Save one note for the household: {"title": one line of plain text, "body_md": Markdown, "related": the handles of the facts it covers}. It answers {"saved": true}, or names what to fix before you call it again.',
    input: { title: z.string(), body_md: z.string(), related: z.array(z.string()) },
  },
  recent_items: {
    description:
      'Return the notes already left for the household today, each with a handle, a kind, a severity and its title as title_label, and the research items stored recently, each with its title as title_label and its source, source_url included.',
    input: {},
  },
  research_topics: {
    description: 'Return the topics to search for today. Each has a handle (f1, f2, …), its place or subject as topic_label, and query_templates to search with.',
    input: {},
  },
  list_properties: {
    description: "Return the household's properties. Each has a handle, its name as property_label, its kind, use mode and legal status, and its current ward and province as commune_name and province_name.",
    input: {},
  },
  ledger: {
    description:
      'Return the income received and the expenses paid in one month or one year: {"property": a handle from list_properties, or none for the whole household, "year", "month": 1 to 12, or none for the whole year}. It answers the totals as one record (period_date_display, income_display, expenses_display, net_display), one record per expense category with spending, and for a year one record per month.',
    input: { property: z.string().optional(), year: z.number().int(), month: z.number().int().optional() },
  },
  portfolio_overview: {
    description:
      "Return the household at a glance today: property and rental unit counts, units leased, occupancy, this month's billed and collected totals, deposits held, and the estimated value of the properties with the oldest valuation date.",
    input: {},
  },
  get_property: {
    description: 'Return one property: {"property": a handle from list_properties}. It answers its latest valuation, each certificate with its status and any mortgage (bank name, amount, date registered), and its owners with their shares.',
    input: { property: z.string() },
  },
  property_metrics: {
    description:
      'Return a rental property\'s figures: {"property": a handle from list_properties, "year"}. It answers the monthly and annual rent in effect, the gross yield on the latest valuation, and one record per unit with whether it is leased and, when empty, for how many days and since when.',
    input: { property: z.string(), year: z.number().int() },
  },
  list_leases: {
    description:
      'Return leases, the soonest end first: {"status": draft, active, ended or terminated, "ends_within_days": only leases ending from today to that many days ahead, "property": a handle from list_properties}, each optional. Each lease has its property, unit, tenant, status, rent, deposit held, start and end dates and the days left until it ends.',
    input: { status: z.string().optional(), ends_within_days: z.number().int().optional(), property: z.string().optional() },
  },
  collections: {
    description:
      'Return the collections board for one month: {"year", "month": 1 to 12, "property": a handle from list_properties, optional}. Each bill due that month, and each earlier bill still owed (carried_over), has its unit, tenant, status (overdue, due, notDue or paid), days overdue, due date and amount; one record per status gives its count and total.',
    input: { year: z.number().int(), month: z.number().int(), property: z.string().optional() },
  },
  tax_position: {
    description:
      'Return each owner\'s rental revenue for the tax year as the tax card shows it: {"year"}. Each owner has the revenue accrued so far and projected for the year, the threshold, what remains below it and the share of it reached, and the estimated VAT and personal income tax.',
    input: { year: z.number().int() },
  },
  payment_behavior: {
    description:
      'Return how each tenant paid this year\'s bills due by today: {"year"}. Each tenant has the bills counted, how many were paid in full after their due date, the average days late, and the bills still overdue; the tenant who paid late most often comes first.',
    input: { year: z.number().int() },
  },
  create_proposal: {
    description:
      'Suggest a change for a member to approve: {"type": create_task, draft_reminder, suggest_lease_renewal, suggest_rent_change or flag_data_issue, "params": the type\'s fields, "rationale": Markdown, "citations": the URLs of the sources it rests on, only when your task asks for them}. Name a property_id or lease_id by the handle of the record a tool returned in this run. It answers {"saved": true}, or names what to fix before you call it again.',
    input: { type: z.string(), params: z.record(z.string(), z.unknown()), rationale: z.string(), citations: z.array(z.string()).optional() },
  },
  add_research_item: {
    description:
      'Save one news item from a page you fetched with WebFetch in this run: {"source_url", "source_name", "published_on": YYYY-MM-DD, "effective_on": YYYY-MM-DD or null, "kind", "relevance": 0 to 1, "title_vi", "summary_vi", "why_it_matters_vi", "topics": handles of research_topics, "properties": handles of list_properties, "quotes": up to 3 short phrases copied exactly from the fetched page}. Cite quote n in your texts as {{f0.quote_n_label}} and the publication date as {{f0.published_display}}. It answers {"saved": true}, {"saved": false, "dropped": <why>}, or names what to fix before you call it again.',
    input: {
      source_url: z.string(),
      source_name: z.string(),
      published_on: z.string(),
      effective_on: z.string().nullable().optional(),
      kind: z.string(),
      relevance: z.number(),
      title_vi: z.string(),
      summary_vi: z.string(),
      why_it_matters_vi: z.string(),
      topics: z.array(z.string()),
      properties: z.array(z.string()).optional(),
      quotes: z.array(z.string()).optional(),
    },
  },
  create_brief: {
    description:
      'Save the morning brief: {"summary": one line of plain text, "todo": [lines], "watch": [lines]}, each line {"text": one line of plain text, "related": the handles of the facts it tells}. It answers {"saved": true}, or names what to fix before you call it again.',
    input: { summary: z.string(), todo: z.array(briefLine), watch: z.array(briefLine) },
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

/** The tool's input parsed by `schema`, or a rejection that names `usage` and each field to fix. */
export function parseToolInput<S extends z.ZodType>(schema: S, raw: unknown, usage: string): z.output<S> {
  const input = schema.safeParse(raw);
  if (!input.success) throw new ToolRejection(`${usage}: ${input.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ')}`);
  return input.data;
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

const JOB_STOPPED = 'This call failed outside your control, and the job has stopped.';

/**
 * A job failure goes to `fail`, which ends the session with the real cause. The model reads only that the call failed,
 * because the MCP server would hand a thrown error's own text to the model.
 */
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
          return { content: [{ type: 'text' as const, text: JOB_STOPPED }], isError: true };
        }
      }),
    ),
  });
}
