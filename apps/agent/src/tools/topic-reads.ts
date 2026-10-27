import type { IsoDate } from '@esta/core/date';
import { dateParts, firstOfMonth } from '@esta/core/date/calendar';
import { parseEstaUri, type EstaLinkType } from '@esta/core/links';
import type { AskReads } from './ask-reads';
import { mcpToolName, runTool, type EstaToolName, type EstaTools } from './server';

/** What her message is about, as the worker reads it before the first turn (AGENT.md §5.6 step 7). */
export type AskTopic =
  | { readonly kind: 'note'; readonly title: string; readonly body: string | null; readonly links: readonly string[] }
  | { readonly kind: 'property'; readonly propertyId: string };

/** One read tool call the worker made for the topic, and the text the model reads of its answer. */
export type TopicCall = { readonly name: EstaToolName; readonly input: Readonly<Record<string, unknown>>; readonly answer: string };

/** The topic with the calls whose records hold the turn's first handles; `property` is the handle of the property asked about. */
export type LoadedTopic =
  | { readonly kind: 'note'; readonly title: string; readonly body: string | null; readonly calls: readonly TopicCall[] }
  | { readonly kind: 'property'; readonly property: string; readonly calls: readonly TopicCall[] };

type Call = { readonly name: EstaToolName; readonly input: Record<string, unknown> };
type Period = { readonly asOf: IsoDate; readonly year: number; readonly month: number };

/** For each kind of record a note links, the read tool whose answer holds it, called on the record's property. */
type TopicRead = {
  readonly tool: EstaToolName;
  propertyOf(id: string, reads: AskReads, period: Period): Promise<string | undefined>;
  input(property: string, period: Period): Record<string, unknown>;
};

const TOPIC_READS: Partial<Record<EstaLinkType, TopicRead>> = {
  legal: { tool: 'get_property', propertyOf: async (id) => id, input: (property) => ({ property }) },
  lease: { tool: 'list_leases', propertyOf: async (id, reads) => (await reads.leases()).find((lease) => lease.id === id)?.property_id, input: (property) => ({ property }) },
  invoice: {
    tool: 'collections',
    propertyOf: async (id, reads, { asOf }) => (await reads.collections(firstOfMonth(asOf))).find((bill) => bill.invoiceId === id)?.propertyId,
    input: (property, { year, month }) => ({ year, month, property }),
  },
  unit: {
    tool: 'property_metrics',
    propertyOf: async (id, reads, { year }) => (await reads.report(year)).units.find((unit) => unit.id === id)?.propertyId,
    input: (property, { year }) => ({ property, year }),
  },
};

async function callAll(tools: EstaTools, calls: readonly Call[]): Promise<TopicCall[]> {
  const answered: TopicCall[] = [];
  for (const { name, input } of calls) {
    const tool = tools.get(mcpToolName(name));
    if (tool === undefined) continue;
    const { text, isError } = await runTool(tool, input);
    if (!isError) answered.push({ name, input, answer: text });
  }
  return answered;
}

/**
 * Reads the topic's records through the turn's own read tools, so they take the first handles of its fact sheet and
 * the model cites them as it cites any tool answer. A property that is no longer listed, archived since she asked,
 * loads as no topic.
 */
export async function loadTopic(tools: EstaTools, topic: AskTopic, { reads, asOf }: { readonly reads: AskReads; readonly asOf: IsoDate }): Promise<LoadedTopic | null> {
  const [listed] = await callAll(tools, [{ name: 'list_properties', input: {} }]);
  if (listed === undefined) return null;
  const handles = new Map((JSON.parse(listed.answer) as { properties: Array<{ id: string; handle: string }> }).properties.map(({ id, handle }) => [id, handle]));
  const period: Period = { asOf, ...dateParts(asOf) };
  if (topic.kind === 'property') {
    const property = handles.get(topic.propertyId);
    if (property === undefined) return null;
    const calls = await callAll(tools, [
      { name: 'get_property', input: { property } },
      { name: 'property_metrics', input: { property, year: period.year } },
    ]);
    return { kind: 'property', property, calls: [listed, ...calls] };
  }
  const calls: Call[] = [];
  for (const link of topic.links) {
    const route = parseEstaUri(link);
    const read = route.ok ? TOPIC_READS[route.value.type] : undefined;
    const property = route.ok && read !== undefined ? handles.get((await read.propertyOf(route.value.id, reads, period)) ?? '') : undefined;
    if (read === undefined || property === undefined) continue;
    const next = { name: read.tool, input: read.input(property, period) };
    if (!calls.some((earlier) => JSON.stringify(earlier) === JSON.stringify(next))) calls.push(next);
  }
  return { kind: 'note', title: topic.title, body: topic.body, calls: [listed, ...(await callAll(tools, calls))] };
}
