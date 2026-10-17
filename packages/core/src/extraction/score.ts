import { certificateV1Schema, parseArea } from '../agent-schemas/certificate_v1';
import { parseDateInput } from '../parse/date-input';
import { REQUIRED_FIELDS, type SchemaName } from './required-fields';

export const HIGH_CONFIDENCE = 0.9;

export type FieldScore = { readonly field: string; readonly hit: boolean };

export type ExtractionScore = {
  readonly schemaValid: boolean;
  /** Required slots the truth fills. */
  readonly required: readonly FieldScore[];
  /** Required slots the truth leaves null, kept out of `required` so empty output earns no free hit. */
  readonly nullTruth: readonly FieldScore[];
  readonly highConfidence: { readonly total: number; readonly correct: number };
};

type Leaf = { readonly value: unknown; readonly confidence: number };

const SCHEMAS = { certificate_v1: certificateV1Schema } as const satisfies Record<SchemaName, unknown>;

const AREA_LEAVES = new Set(['area_m2', 'footprint_m2', 'floor_area_m2']);
const DATE_LEAVES = new Set(['issued_on', 'date']);
const CODE_LEAVES = new Set(['land_use_code']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLeaf(value: unknown): value is Leaf {
  return isRecord(value) && 'value' in value && typeof value.confidence === 'number';
}

/** Collapses the formats a model may choose so `125,5 m²`, an NFD name or `07/10/2026` match their truth. */
export function normalizeValue(leafName: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (AREA_LEAVES.has(leafName)) {
    const area = parseArea(value);
    return typeof area === 'number' && Number.isFinite(area) ? area.toFixed(2) : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (DATE_LEAVES.has(leafName)) {
    const parsed = parseDateInput(text);
    return parsed.ok ? parsed.value : text;
  }
  return CODE_LEAVES.has(leafName) ? text.toUpperCase() : text;
}

type FlatLeaf = { readonly path: string; readonly leafName: string; readonly leaf: Leaf };

/** Walks a result (valid or not) and lists every `{ value, confidence }` leaf with its path, array items by index. */
export function flattenLeaves(node: unknown, path = ''): FlatLeaf[] {
  if (isLeaf(node)) return [{ path, leafName: path.split('.').at(-1)?.replace(/\[\d+\]$/, '') ?? path, leaf: node }];
  if (Array.isArray(node)) return node.flatMap((item, index) => flattenLeaves(item, `${path}[${index}]`));
  if (isRecord(node)) {
    return Object.entries(node).flatMap(([key, child]) => flattenLeaves(child, path === '' ? key : `${path}.${key}`));
  }
  return [];
}

/** Every normalized value at a required path such as `parcels[].parcel_no`, sorted so order never matters. */
function valuesAt(node: unknown, field: string): string[] {
  const [head, ...rest] = field.split('.');
  if (head === undefined) return [];
  const wantsEvery = head.endsWith('[]');
  const key = wantsEvery ? head.slice(0, -2) : head;
  const child = isRecord(node) ? node[key] : undefined;
  const items = wantsEvery ? (Array.isArray(child) ? child : []) : [child];
  if (rest.length > 0) return items.flatMap((item) => valuesAt(item, rest.join('.'))).sort();
  return items.map((item) => (isLeaf(item) ? normalizeValue(key, item.value) : null)).filter((v): v is string => v !== null).sort();
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Scores one extraction against its truth: zod validity, exact hits on the schema's required
 * fields, and how many fields the model marked at or above 0.9 confidence are actually right.
 * A result the schema rejects scores no hit in `required` or `nullTruth`.
 */
export function scoreExtraction(schemaName: SchemaName, truth: unknown, result: unknown): ExtractionScore {
  const schemaValid = SCHEMAS[schemaName].safeParse(result).success;
  const slots = REQUIRED_FIELDS[schemaName].map((field) => {
    const expected = valuesAt(truth, field);
    return { field, isNull: expected.length === 0, hit: schemaValid && sameValues(expected, valuesAt(result, field)) };
  });
  const required = slots.filter((slot) => !slot.isNull).map(({ field, hit }) => ({ field, hit }));
  const nullTruth = slots.filter((slot) => slot.isNull).map(({ field, hit }) => ({ field, hit }));
  const truthByPath = new Map(flattenLeaves(truth).map((entry) => [entry.path, entry]));
  const confident = flattenLeaves(result).filter((entry) => entry.leaf.confidence >= HIGH_CONFIDENCE);
  const correct = confident.filter((entry) => {
    const expected = truthByPath.get(entry.path);
    return expected !== undefined && normalizeValue(entry.leafName, expected.leaf.value) === normalizeValue(entry.leafName, entry.leaf.value);
  });
  return { schemaValid, required, nullTruth, highConfidence: { total: confident.length, correct: correct.length } };
}
