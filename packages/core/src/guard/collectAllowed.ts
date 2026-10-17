import type { IsoDate } from '../date/iso-date';
import { scan } from './extractNumbers';
import { indexKeys, type CanonicalNumber } from './normalize';

export type ToolResult = { readonly tool: string; readonly result: unknown };

/** The values the prompt injects (AGENT.md §6.3), which the model may repeat without a tool result. */
export type GuardContext = { readonly today: IsoDate; readonly householdName: string };

/** Where an allowed value came from: the tool, the JSON path inside its result, and the ids of the records on that path. */
export type Source = {
  readonly tool: string;
  readonly path: string;
  readonly ids: readonly string[];
  readonly text: string;
};

export type AllowedIndex = ReadonlyMap<string, readonly Source[]>;

export const CONTEXT_TOOL = 'context';

/** `id`, `unit_id` and `property_ids` name the records a value belongs to. */
const ID_KEY = /(?:^|_)ids?$/;
/** Ids and keys such as `subject_key` are identifiers, whose digits are not numbers the model may quote. */
const IDENTIFIER_KEY = /(?:^|_)(?:ids?|keys?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idsOf(record: Readonly<Record<string, unknown>>): string[] {
  const ids: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!ID_KEY.test(key)) continue;
    if (typeof value === 'string') ids.push(value);
    if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') ids.push(item);
  }
  return ids;
}

/**
 * Indexes every number in the tool results and the context: raw JSON numbers, numbers inside strings
 * such as `_display` values and labels (`Phòng 5`), and the dates and times inside timestamps.
 * Id and key fields, UUIDs and URLs carry no numbers the model may quote.
 */
export function collectAllowed(toolResults: readonly ToolResult[], context: GuardContext): AllowedIndex {
  const index = new Map<string, Source[]>();
  const add = (value: CanonicalNumber, source: Source): void => {
    for (const key of indexKeys(value)) {
      const sources = index.get(key);
      if (sources === undefined) index.set(key, [source]);
      else sources.push(source);
    }
  };

  const walk = (tool: string, value: unknown, path: string, ids: readonly string[]): void => {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) add({ kind: 'count', value }, { tool, path, ids, text: String(value) });
      return;
    }
    if (typeof value === 'string') {
      if (UUID.test(value) || URL_LIKE.test(value)) return;
      for (const number of scan(value).numbers) {
        if (number.value.kind !== 'invalid') add(number.value, { tool, path, ids, text: number.text });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(tool, item, `${path}[${i}]`, ids));
      return;
    }
    if (!isRecord(value)) return;
    const recordIds = [...ids, ...idsOf(value)];
    for (const [key, child] of Object.entries(value)) {
      if (!IDENTIFIER_KEY.test(key)) walk(tool, child, path === '' ? key : `${path}.${key}`, recordIds);
    }
  };

  for (const { tool, result } of toolResults) walk(tool, result, '', []);
  walk(CONTEXT_TOOL, { today: context.today, household_name: context.householdName }, '', []);
  return index;
}
