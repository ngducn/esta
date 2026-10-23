import { z } from 'zod';
import { AGENT_SCHEMAS } from '../agent-schemas';
import { ANNOTATION_KINDS, CERTIFICATE_FORMS } from '../agent-schemas/certificate_v1';
import { reduceNationalIds } from '../agent-schemas/reduce-national-ids';
import { parseConsumption, UTILITY_BILL_KINDS } from '../agent-schemas/utility_bill_v1';
import { daysInMonth, isIsoDate, type IsoDate } from '../date/iso-date';
import { idLast4 } from '../names';
import { isoFromParts, parseDateInput } from '../parse/date-input';
import { measureInputText, parseMeasureInput, type MeasureReason } from '../parse/measure';
import { parseVndInput } from '../parse/vnd-input';
import { LONG_TERM, USE_FORMS } from '../schemas/legal';
import type { SchemaName } from './required-fields';

export { isSchemaName, type SchemaName } from './required-fields';

/** A leaf as the worker saves it (DOMAIN-VN §2.1): the value read, the model's confidence, the page it came from. */
export type Leaf = { readonly value: unknown; readonly confidence: number; readonly page: number | null };

/** A value that does not read as its kind is `invalid`; an area also says when it is too precise or too large. */
export type Parsed<T> = { readonly ok: true; readonly value: T | null } | { readonly ok: false; readonly reason: MeasureReason };

const nothing = { ok: true, value: null } as const;
const refused = { ok: false, reason: 'invalid' } as const;
const accept = <T>(value: T): Parsed<T> => ({ ok: true, value });

function asText(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  return text === '' ? null : text;
}

const choice = <T extends string>(options: readonly T[]) => ({
  options,
  parse(raw: unknown): Parsed<T> {
    const text = asText(raw);
    if (text === null) return nothing;
    return (options as readonly string[]).includes(text) ? accept(text as T) : refused;
  },
});

const TERM_DATE = /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/u;
const TERM_END = /(?<!\p{L})đến(?!\p{L})/iu;
const TERM_START = /(?<!\p{L})từ(?!\p{L})/iu;

/**
 * The part of a term that names its end. A range such as `Từ tháng 10/1993 đến tháng 10/2043` ends after `đến`; a term
 * that names only its start, such as `50 năm kể từ ngày 15/10/1993`, has no end to read.
 */
function termEnd(text: string): string | null {
  const end = TERM_END.exec(text);
  if (end !== null) return text.slice(end.index + end[0].length);
  return TERM_START.test(text) ? null : text;
}
const TERM_MONTH = /(?<![\d./-])(\d{1,2})[./-](\d{4})(?!\d)/u;

/** [app rule] A term printed to the month, as pre-2009 certificates print `Đến tháng 10/2043`, runs to its last day. */
function readMonthEnd(text: string): IsoDate | null {
  const [, month, year] = TERM_MONTH.exec(text) ?? [];
  if (month === undefined || year === undefined) return null;
  const parsed = isoFromParts(year, month, String(daysInMonth(Number(year), Number(month))));
  return parsed.ok ? parsed.value : null;
}

function readDate(text: string): IsoDate | null {
  if (isIsoDate(text)) return text;
  const parsed = parseDateInput(text);
  return parsed.ok ? parsed.value : null;
}

/**
 * How each kind of field reads a value, whether the model printed it or Mẹ typed it, and the choices a picker offers.
 * A value that cannot be read is refused, never guessed.
 */
export const INPUT_KINDS = {
  text: {
    options: null,
    parse: (raw: unknown): Parsed<string> => accept(asText(raw)),
  },
  area: {
    options: null,
    parse(raw: unknown): Parsed<number> {
      // A number the assistant returns meets the rule typed text meets, so 1.255 is too precise, not invalid.
      const text = typeof raw === 'number' ? measureInputText(raw) : asText(raw);
      if (text === null) return nothing;
      const area = parseMeasureInput(text, 'area');
      return area.ok ? accept(area.value) : area;
    },
  },
  date: {
    options: null,
    parse(raw: unknown): Parsed<IsoDate> {
      const text = asText(raw);
      if (text === null) return nothing;
      const date = readDate(text);
      return date === null ? refused : accept(date);
    },
  },
  land_use_code: {
    options: null,
    parse(raw: unknown): Parsed<string> {
      const text = asText(raw);
      if (text === null) return nothing;
      return text.length <= 20 ? accept(text.toUpperCase()) : refused;
    },
  },
  form: choice(CERTIFICATE_FORMS),
  money: {
    options: null,
    parse(raw: unknown): Parsed<number> {
      if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? accept(raw) : refused;
      const text = asText(raw);
      if (text === null) return nothing;
      const parsed = parseVndInput(text);
      return parsed.ok ? accept(parsed.value) : refused;
    },
  },
  integer: {
    options: null,
    parse(raw: unknown): Parsed<number> {
      const text = asText(raw);
      if (text === null) return nothing;
      return /^\d{1,4}$/u.test(text) ? accept(Number(text)) : refused;
    },
  },
  number: {
    options: null,
    parse(raw: unknown): Parsed<number> {
      if (asText(raw) === null) return nothing;
      const value = parseConsumption(raw);
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? accept(value) : refused;
    },
  },
  boolean: {
    options: null,
    parse: (raw: unknown): Parsed<boolean> => (typeof raw === 'boolean' ? accept(raw) : raw === null ? nothing : refused),
  },
  /** Printed as `Sử dụng riêng` or `Sử dụng chung` (DOMAIN-VN §2.1); picked as the column value. */
  use_form: {
    options: USE_FORMS,
    parse(raw: unknown): Parsed<(typeof USE_FORMS)[number]> {
      const text = asText(raw)?.toLocaleLowerCase('vi');
      if (text === undefined) return nothing;
      if (text === 'private' || text.includes('riêng')) return accept('private');
      if (text === 'shared' || text.includes('chung')) return accept('shared');
      return refused;
    },
  },
  /**
   * `Lâu dài` is long term; a term with an end date keeps the date, and one with an end month that month's last day. A
   * range keeps its end, whether it is printed to the month or to the day.
   */
  term: {
    options: null,
    parse(raw: unknown): Parsed<string> {
      const text = asText(raw);
      if (text === null) return nothing;
      if (text === LONG_TERM || text.toLocaleLowerCase('vi').includes('lâu dài')) return accept(LONG_TERM);
      const end = termEnd(text);
      if (end === null) return refused;
      const found = TERM_DATE.exec(end)?.[1];
      const date = found === undefined ? readMonthEnd(end) : readDate(found);
      return date === null ? refused : accept(date);
    },
  },
  /** SPEC D11: whatever is typed keeps only its last four digits. */
  id_last4: {
    options: null,
    parse(raw: unknown): Parsed<string> {
      const text = asText(raw);
      if (text === null) return nothing;
      const last4 = idLast4(text);
      return last4.length === 4 ? accept(last4) : refused;
    },
  },
  annotation_kind: choice(ANNOTATION_KINDS),
  utility_kind: choice(UTILITY_BILL_KINDS),
} as const;

export type InputKind = keyof typeof INPUT_KINDS;

/**
 * One value the assistant read, read as its kind, with every national ID cut to its last four digits (SPEC D11): in
 * the text before the parse, and again in the text the parse yields, which squeezes spaces and so can join two digit
 * groups into one ID. A number read with an ID in its text is refused, as its last four would be a wrong number. What
 * this returns is what the review shows and acceptance stores. What Mẹ types goes through its kind's own parse and is
 * kept as typed.
 */
export function readInput(kind: InputKind, raw: unknown): Parsed<string | number | boolean> {
  const reduced = typeof raw === 'string' ? reduceNationalIds(raw) : raw;
  const parsed: Parsed<string | number | boolean> = INPUT_KINDS[kind].parse(reduced);
  if (!parsed.ok) return parsed;
  if (typeof parsed.value === 'number') return reduced === raw ? parsed : refused;
  return typeof parsed.value === 'string' ? accept(reduceNationalIds(parsed.value)) : parsed;
}

/** The value schema of one leaf of an extraction schema, named by a descriptor path such as `parcels[].area_m2`. */
function leafValue(schemaName: SchemaName, path: string): z.core.$ZodType | undefined {
  let node: z.core.$ZodType | undefined = AGENT_SCHEMAS[schemaName].schema;
  for (const segment of [...path.split('.'), 'value']) {
    const child: z.core.$ZodType | undefined = node instanceof z.ZodObject ? node.shape[segment.replace(/\[\]$/u, '')] : undefined;
    node = child instanceof z.ZodArray ? child.element : child;
  }
  return node;
}

/**
 * Whether a number keeps the bounds its leaf schema sets on what the assistant reads, such as an area of at most
 * 100.000.000 m² or a year from 1800 to 2100, so a typed number is held to the same bounds.
 */
export function withinLeafBounds(schemaName: SchemaName, path: string, value: number): boolean {
  const schema = leafValue(schemaName, path);
  return schema !== undefined && z.safeParse(schema, value).success;
}

export type TargetTable = 'parties' | 'certificates' | 'parcels' | 'structures' | 'properties' | 'utility_accounts' | 'leases';

/** Where an accepted value lands. A leaf with no target is not reviewed: no table holds it yet. */
export type FieldTarget = { readonly table: TargetTable; readonly column: string };

export type FieldDescriptor = {
  /** The schema leaf, `[]` standing for every item of a list. */
  readonly path: string;
  /** Message key under `extraction.fields`. */
  readonly label: string;
  readonly input: InputKind;
  /** The row this field belongs to is written only when the field holds a value. */
  readonly required: boolean;
  readonly target: FieldTarget | null;
};

const field = (path: string, label: string, input: InputKind, target: FieldTarget | null, required = false): FieldDescriptor => ({
  path,
  label,
  input,
  required,
  target,
});
const to = (table: TargetTable, column: string): FieldTarget => ({ table, column });

/** One descriptor per leaf of each extraction schema, in reading order. The review renders from this list alone. */
export const EXTRACTION_FIELDS = {
  certificate_v1: [
    field('form', 'form', 'form', to('certificates', 'form'), true),
    field('serial_no', 'serialNo', 'text', to('certificates', 'serial_no')),
    field('book_entry_no', 'bookEntryNo', 'text', to('certificates', 'book_entry_no')),
    field('issued_on', 'issuedOn', 'date', to('certificates', 'issued_on')),
    field('issued_by', 'issuedBy', 'text', to('certificates', 'issued_by')),
    field('has_qr', 'hasQr', 'boolean', null),
    field('notes_text', 'notesText', 'text', null),
    field('holders[].full_name', 'holderName', 'text', to('parties', 'full_name'), true),
    field('holders[].birth_year', 'birthYear', 'integer', null),
    field('holders[].id_last4', 'idLast4', 'id_last4', to('parties', 'id_last4')),
    field('holders[].address_text', 'holderAddress', 'text', to('parties', 'address_text')),
    field('holders[].relation', 'relation', 'text', null),
    field('parcels[].parcel_no', 'parcelNo', 'text', to('parcels', 'parcel_no')),
    field('parcels[].map_sheet_no', 'mapSheetNo', 'text', to('parcels', 'map_sheet_no')),
    field('parcels[].address_text', 'parcelAddress', 'text', to('properties', 'certificate_address_text')),
    field('parcels[].area_m2', 'parcelArea', 'area', to('parcels', 'area_m2')),
    field('parcels[].use_form', 'useForm', 'use_form', to('parcels', 'use_form')),
    field('parcels[].origin_text', 'origin', 'text', to('parcels', 'origin_text')),
    field('parcels[].purposes[].land_use_code', 'landUseCode', 'land_use_code', to('parcels', 'purposes.land_use_code'), true),
    field('parcels[].purposes[].area_m2', 'purposeArea', 'area', to('parcels', 'purposes.area_m2')),
    field('parcels[].purposes[].term', 'term', 'term', to('parcels', 'purposes.term')),
    field('structures[].kind', 'structureKind', 'text', to('structures', 'kind'), true),
    field('structures[].footprint_m2', 'footprint', 'area', to('structures', 'footprint_m2')),
    field('structures[].floor_area_m2', 'floorArea', 'area', to('structures', 'floor_area_m2')),
    field('structures[].floors', 'floors', 'integer', to('structures', 'floors')),
    field('structures[].structure_text', 'structureText', 'text', to('structures', 'structure_text')),
    field('structures[].completed_year', 'completedYear', 'integer', to('structures', 'completed_year')),
    field('structures[].ownership_term', 'ownershipTerm', 'text', to('structures', 'ownership_term')),
    field('annotations[].date', 'annotationDate', 'date', to('certificates', 'annotations.date')),
    field('annotations[].text', 'annotationText', 'text', to('certificates', 'annotations.text'), true),
    field('annotations[].kind', 'annotationKind', 'annotation_kind', to('certificates', 'annotations.kind')),
  ],
  utility_bill_v1: [
    field('kind', 'billKind', 'utility_kind', to('utility_accounts', 'kind'), true),
    field('provider', 'provider', 'text', to('utility_accounts', 'provider')),
    field('customer_code', 'customerCode', 'text', to('utility_accounts', 'customer_code')),
    field('holder_name', 'billHolder', 'text', to('utility_accounts', 'holder_name')),
    field('address_text', 'billAddress', 'text', null),
    field('period', 'period', 'text', null),
    field('amount_vnd', 'amount', 'money', null),
    field('consumption', 'consumption', 'number', null),
  ],
  lease_v1: [
    field('tenant_name', 'tenantName', 'text', to('parties', 'full_name')),
    field('tenant_phone', 'tenantPhone', 'text', to('parties', 'phone')),
    field('tenant_id_last4', 'idLast4', 'id_last4', null),
    field('property_address', 'leaseAddress', 'text', null),
    field('unit_label', 'unitLabel', 'text', to('leases', 'unit_id')),
    field('start_date', 'startDate', 'date', to('leases', 'start_date')),
    field('end_date', 'endDate', 'date', to('leases', 'end_date')),
    field('term_months', 'termMonths', 'integer', to('leases', 'end_date')),
    field('rent_vnd', 'rent', 'money', to('leases', 'rent_vnd')),
    field('billing_cycle_months', 'cycleMonths', 'integer', to('leases', 'billing_cycle_months')),
    field('due_day', 'dueDay', 'integer', null),
    field('deposit_vnd', 'deposit', 'money', to('leases', 'deposit_vnd')),
    field('notes', 'leaseNotes', 'text', null),
  ],
} as const satisfies Record<SchemaName, readonly FieldDescriptor[]>;

/** The lists a result holds, in the order their sections read. A manual entry starts with one holder, parcel and purpose. */
const LISTS = ['holders', 'parcels', 'purposes', 'structures', 'annotations'] as const;
export type ListName = (typeof LISTS)[number];
const MANUAL_ITEMS: Readonly<Record<ListName, number>> = { holders: 1, parcels: 1, purposes: 1, structures: 0, annotations: 0 };

export type Section = { readonly key: string; readonly list: ListName | null; readonly numbers: readonly number[] };

/** One reviewable field of one extraction: a concrete path such as `parcels[0].area_m2`, its descriptor and its leaf. */
export type ReviewField = {
  readonly path: string;
  readonly descriptor: FieldDescriptor;
  /** Null on a manual entry, where nothing was read. */
  readonly leaf: Leaf | null;
  readonly section: Section;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asLeaf(value: unknown): Leaf | null {
  if (!isRecord(value) || !('value' in value) || typeof value.confidence !== 'number') return null;
  return { value: value.value, confidence: value.confidence, page: typeof value.page === 'number' ? value.page : null };
}

type Expanded = { readonly path: string; readonly leaf: Leaf | null; readonly items: readonly (readonly [ListName, number])[] };

function isList(name: string): name is ListName {
  return (LISTS as readonly string[]).includes(name);
}

function expand(segments: readonly string[], node: unknown, prefix: string, items: Expanded['items'], manual: boolean): Expanded[] {
  const [head, ...rest] = segments;
  if (head === undefined) return [];
  if (head.endsWith('[]')) {
    const list = head.slice(0, -2);
    if (!isList(list)) return [];
    const children: unknown[] = manual ? Array<unknown>(MANUAL_ITEMS[list]).fill(null) : isRecord(node) && Array.isArray(node[list]) ? node[list] : [];
    return children.flatMap((child, index) => expand(rest, child, `${prefix}${list}[${index}].`, [...items, [list, index]], manual));
  }
  return [{ path: `${prefix}${head}`, leaf: manual ? null : asLeaf(isRecord(node) ? node[head] : undefined), items }];
}

function compareItems(a: Expanded['items'], b: Expanded['items']): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const [listA, indexA] = a[i] ?? ['holders', 0];
    const [listB, indexB] = b[i] ?? ['holders', 0];
    const byList = LISTS.indexOf(listA) - LISTS.indexOf(listB);
    if (byList !== 0) return byList;
    if (indexA !== indexB) return indexA - indexB;
  }
  return a.length - b.length;
}

/**
 * The fields Mẹ reviews for one extraction, grouped item by item (the certificate, each holder, each parcel and its
 * purposes, each structure, each annotation). `result` null is a manual entry: the same rows, empty.
 */
export function reviewFields(schemaName: SchemaName, result: unknown): ReviewField[] {
  const manual = result === null;
  const expanded = EXTRACTION_FIELDS[schemaName].flatMap((descriptor, order) =>
    descriptor.target === null ? [] : expand(descriptor.path.split('.'), result, '', [], manual).map((found) => ({ ...found, descriptor, order })),
  );
  return expanded
    .toSorted((a, b) => compareItems(a.items, b.items) || a.order - b.order)
    .map(({ path, leaf, descriptor, items }) => ({
      path,
      leaf,
      descriptor,
      section: {
        key: items.map(([list, index]) => `${list}[${index}]`).join('.'),
        list: items.at(-1)?.[0] ?? null,
        numbers: items.map(([, index]) => index + 1),
      },
    }));
}
