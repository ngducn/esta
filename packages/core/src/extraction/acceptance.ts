import type { z } from 'zod';
import { certificateSchema, newParcelSchema, PARCEL_UNIDENTIFIED, type parcelSchema, structureSchema } from '../schemas/legal';
import { utilityAccountSchema } from '../schemas/units';
import { readInput, reviewFields, withinLeafBounds, type ReviewField } from './fields';
import type { SchemaName } from './required-fields';
import { uuidV5 } from './uuid-v5';

/** What Mẹ did with one field: `Đúng` keeps the value read, `Sửa` replaces it with what she typed or picked. */
export type FieldDecision = { readonly kind: 'accepted' } | { readonly kind: 'edited'; readonly value: string };

/** Keyed by concrete path, such as `parcels[0].area_m2`. A field with no decision is left out of every write. */
export type Decisions = Readonly<Record<string, FieldDecision>>;

/** `document_extractions.accepted_fields`: what was decided and the value written, so the record stands on its own. */
export type AcceptedFields = Readonly<Record<string, { readonly decision: 'accepted' | 'edited'; readonly value: string | number | boolean }>>;

export type AcceptanceExtraction = {
  readonly id: string;
  readonly householdId: string;
  readonly propertyId: string;
  readonly documentId: string;
  /** The worker's result, null for a manual entry. */
  readonly result: unknown;
};

export type ExistingParty = { readonly id: string; readonly fullName: string; readonly idLast4: string | null };
export type ExistingAccount = { readonly id: string; readonly propertyId: string; readonly kind: string; readonly customerCode: string | null };

/** The household's rows a plan may reuse instead of writing a second copy. */
export type PlanContext = { readonly parties: readonly ExistingParty[]; readonly accounts: readonly ExistingAccount[] };

type Scoped = { readonly id: string; readonly household_id: string };
type OnProperty = Scoped & { readonly property_id: string };

export type PartyRow = Scoped & {
  readonly kind: 'individual';
  readonly full_name: string;
  readonly id_last4: string | null;
  readonly address_text: string | null;
  readonly tags: readonly ['owner'];
};
type CertificateColumns = Omit<z.output<typeof certificateSchema>, 'status' | 'mortgage'>;
export type CertificateRow = OnProperty & CertificateColumns & { readonly document_id: string; readonly extraction_id: string };
export type ParcelRow = OnProperty & z.output<typeof parcelSchema>;
export type StructureRow = OnProperty & z.output<typeof structureSchema>;
export type PropertyAddressRow = Scoped & { readonly certificate_address_text: string };
export type UtilityAccountRow = OnProperty & z.output<typeof utilityAccountSchema>;

/** One upsert, in order: a retry runs the same steps with the same ids and converges on the same rows. */
export type PlanStep =
  | { readonly table: 'parties'; readonly row: PartyRow }
  | { readonly table: 'certificates'; readonly row: CertificateRow }
  | { readonly table: 'parcels'; readonly row: ParcelRow }
  | { readonly table: 'structures'; readonly row: StructureRow }
  | { readonly table: 'properties'; readonly row: PropertyAddressRow }
  | { readonly table: 'utility_accounts'; readonly row: UtilityAccountRow };

export type AcceptancePlan = { readonly steps: readonly PlanStep[]; readonly acceptedFields: AcceptedFields };

/**
 * `invalid`: a decided value does not read as its kind. `out_of_range`: a number lies outside the bounds its leaf schema
 * keeps. `missing`: a row has values but not the field it needs.
 */
export type PlanResult =
  | { readonly ok: true; readonly plan: AcceptancePlan }
  | { readonly ok: false; readonly reason: 'invalid' | 'out_of_range' | 'missing'; readonly paths: readonly string[] };

type Value = string | number | boolean;

/** Row ids are UUIDv5 of `extraction:<id>:<path>`, so running a plan twice names the same rows. */
export const rowId = (extractionId: string, path: string) => uuidV5(`extraction:${extractionId}:${path}`);

/** The manual entry for a failed read is named by that read, so a retried save inserts it once. */
export const manualEntryId = (failedExtractionId: string) => uuidV5(`manual:${failedExtractionId}`);

/** NFC, one space, lower case: `Nguyễn  Thị Demo` and `NGUYỄN THỊ DEMO` are one name. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi');
}

type Decided = {
  readonly fields: readonly ReviewField[];
  readonly values: ReadonlyMap<string, Value>;
  readonly acceptedFields: AcceptedFields;
  readonly invalid: readonly string[];
  readonly outOfRange: readonly string[];
};

/** Reads every decided field as its kind, as the review shows it. */
function decide(schemaName: SchemaName, result: unknown, decisions: Decisions): Decided {
  const fields = reviewFields(schemaName, result);
  const values = new Map<string, Value>();
  const accepted: Record<string, AcceptedFields[string]> = {};
  const invalid: string[] = [];
  const outOfRange: string[] = [];
  for (const field of fields) {
    const decision = decisions[field.path];
    if (decision === undefined) continue;
    const parsed = readInput(field.descriptor.input, decision.kind === 'edited' ? decision.value : (field.leaf?.value ?? null));
    if (!parsed.ok) {
      invalid.push(field.path);
      continue;
    }
    if (parsed.value === null) continue;
    if (typeof parsed.value === 'number' && !withinLeafBounds(schemaName, field.descriptor.path, parsed.value)) {
      outOfRange.push(field.path);
      continue;
    }
    values.set(field.path, parsed.value);
    accepted[field.path] = { decision: decision.kind, value: parsed.value };
  }
  return { fields, values, acceptedFields: accepted, invalid, outOfRange };
}

function itemCount(fields: readonly ReviewField[], key: (index: number) => string): number {
  let count = 0;
  while (fields.some((field) => field.section.key === key(count))) count += 1;
  return count;
}

type Item = { readonly prefix: string; readonly read: (leaf: string) => Value | null; readonly any: boolean };

function itemOf(values: ReadonlyMap<string, Value>, prefix: string): Item {
  const read = (leaf: string) => values.get(`${prefix}${leaf}`) ?? null;
  const any = [...values.keys()].some((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('['));
  return { prefix, read, any };
}

const text = (value: Value | null) => (typeof value === 'string' ? value : null);
const num = (value: Value | null) => (typeof value === 'number' ? value : null);

/** A zod issue path such as `['purposes', 0, 'area_m2']` back to the field it came from. */
function issuePaths(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.reduce<string>((path, key) => (typeof key === 'number' ? `${path}[${key}]` : path === prefix ? `${path}${String(key)}` : `${path}.${String(key)}`), prefix),
  );
}

type Collected = { steps: PlanStep[]; missing: string[]; invalid: string[] };

function finish(collected: Collected, decided: Decided): PlanResult {
  if (collected.invalid.length > 0) return { ok: false, reason: 'invalid', paths: collected.invalid };
  if (decided.outOfRange.length > 0) return { ok: false, reason: 'out_of_range', paths: decided.outOfRange };
  if (collected.missing.length > 0) return { ok: false, reason: 'missing', paths: collected.missing };
  return { ok: true, plan: { steps: collected.steps, acceptedFields: decided.acceptedFields } };
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

/** Every string and number in a row but the UUIDs that key the rows, which the ID rule would misread. */
function scalars(node: unknown): (string | number)[] {
  if (typeof node === 'number') return [node];
  if (typeof node === 'string') return UUID.test(node) ? [] : [node];
  return typeof node === 'object' && node !== null ? Object.values(node).flatMap(scalars) : [];
}

/** One value a plan writes, and the field it came from; null when no decided field holds it, such as a party's tag. */
export type PlannedValue = { readonly path: string | null; readonly value: string | number };

/**
 * Every value a plan writes, into `accepted_fields` and into its rows, for the database to judge against SPEC D11 by the
 * extraction CHECK's own rule before anything is written.
 */
export function plannedValues(plan: AcceptancePlan): PlannedValue[] {
  const decided = Object.entries(plan.acceptedFields).flatMap(([path, { value }]) => (typeof value === 'boolean' ? [] : [{ path, value }]));
  const pathOf = new Map<string | number, string>();
  for (const { path, value } of decided) if (!pathOf.has(value)) pathOf.set(value, path);
  return [...decided, ...scalars(plan.steps).map((value) => ({ path: pathOf.get(value) ?? null, value }))];
}

/**
 * The writes that accepting a certificate review makes, in order: each holder as a party (an existing party with the
 * same normalized name and `id_last4` is reused, never rewritten), the certificate keyed by the extraction, its
 * parcels and structures, and the property's certificate address. Only decided fields enter it.
 */
export function planCertificateAcceptance(extraction: AcceptanceExtraction, decisions: Decisions, { parties }: Pick<PlanContext, 'parties'>): PlanResult {
  const decided = decide('certificate_v1', extraction.result, decisions);
  const { values, fields } = decided;
  const scope = { household_id: extraction.householdId, property_id: extraction.propertyId };
  const id = (path: string) => rowId(extraction.id, path);
  const collected: Collected = { steps: [], missing: [], invalid: [...decided.invalid] };
  const root = itemOf(values, '');
  if (root.read('form') === null) collected.missing.push('form');

  const holderIds: string[] = [];
  for (let i = 0; i < itemCount(fields, (n) => `holders[${n}]`); i += 1) {
    const holder = itemOf(values, `holders[${i}].`);
    const fullName = text(holder.read('full_name'));
    if (fullName === null) {
      if (holder.any) collected.missing.push(`${holder.prefix}full_name`);
      continue;
    }
    const idLast4 = text(holder.read('id_last4'));
    const match = parties.find((party) => idLast4 !== null && party.idLast4 === idLast4 && normalizeName(party.fullName) === normalizeName(fullName));
    const partyId = match?.id ?? id(`holders[${i}]`);
    if (!holderIds.includes(partyId)) holderIds.push(partyId);
    if (match !== undefined) continue;
    collected.steps.push({
      table: 'parties',
      row: { id: partyId, household_id: extraction.householdId, kind: 'individual', full_name: fullName, id_last4: idLast4, address_text: text(holder.read('address_text')), tags: ['owner'] },
    });
  }

  const certificateId = id('certificate');
  const annotations = [];
  for (let k = 0; k < itemCount(fields, (n) => `annotations[${n}]`); k += 1) {
    const annotation = itemOf(values, `annotations[${k}].`);
    const annotationText = text(annotation.read('text'));
    if (annotationText === null) {
      if (annotation.any) collected.missing.push(`${annotation.prefix}text`);
      continue;
    }
    const date = text(annotation.read('date'));
    const kind = text(annotation.read('kind'));
    annotations.push({ text: annotationText, ...(date === null ? {} : { date }), ...(kind === null ? {} : { kind }) });
  }
  const form = root.read('form');
  const certificate = certificateSchema.safeParse({
    form,
    serial_no: text(root.read('serial_no')),
    book_entry_no: text(root.read('book_entry_no')),
    issued_on: text(root.read('issued_on')),
    issued_by: text(root.read('issued_by')),
    holder_party_ids: holderIds,
    annotations,
    status: 'valid',
    mortgage: null,
  });
  if (certificate.success) {
    const { serial_no, book_entry_no, issued_on, issued_by, holder_party_ids } = certificate.data;
    collected.steps.push({
      table: 'certificates',
      row: {
        id: certificateId,
        ...scope,
        form: certificate.data.form,
        serial_no,
        book_entry_no,
        issued_on,
        issued_by,
        holder_party_ids,
        annotations: certificate.data.annotations,
        document_id: extraction.documentId,
        extraction_id: extraction.id,
      },
    });
  } else if (form !== null) {
    collected.invalid.push(...issuePaths('', certificate.error));
  }

  let address: string | null = null;
  for (let i = 0; i < itemCount(fields, (n) => `parcels[${n}]`); i += 1) {
    const parcel = itemOf(values, `parcels[${i}].`);
    address ??= text(parcel.read('address_text'));
    const purposes = [];
    for (let j = 0; j < itemCount(fields, (n) => `parcels[${i}].purposes[${n}]`); j += 1) {
      const purpose = itemOf(values, `${parcel.prefix}purposes[${j}].`);
      const code = text(purpose.read('land_use_code'));
      if (code === null) {
        if (purpose.any) collected.missing.push(`${purpose.prefix}land_use_code`);
        continue;
      }
      const area = num(purpose.read('area_m2'));
      const term = text(purpose.read('term'));
      purposes.push({ land_use_code: code, ...(area === null ? {} : { area_m2: area }), ...(term === null ? {} : { term }) });
    }
    if (!parcel.any && purposes.length === 0) continue;
    const row = newParcelSchema.safeParse({
      certificate_id: certificateId,
      parcel_no: text(parcel.read('parcel_no')),
      map_sheet_no: text(parcel.read('map_sheet_no')),
      area_m2: num(parcel.read('area_m2')),
      use_form: parcel.read('use_form'),
      purposes,
      origin_text: text(parcel.read('origin_text')),
    });
    if (row.success) collected.steps.push({ table: 'parcels', row: { id: id(`parcels[${i}]`), ...scope, ...row.data } });
    else if (row.error.issues.some((issue) => issue.message === PARCEL_UNIDENTIFIED)) collected.missing.push(`${parcel.prefix}parcel_no`);
    else collected.invalid.push(...issuePaths(parcel.prefix, row.error));
  }

  for (let i = 0; i < itemCount(fields, (n) => `structures[${n}]`); i += 1) {
    const structure = itemOf(values, `structures[${i}].`);
    const kind = text(structure.read('kind'));
    if (kind === null) {
      if (structure.any) collected.missing.push(`${structure.prefix}kind`);
      continue;
    }
    const row = structureSchema.safeParse({
      certificate_id: certificateId,
      kind,
      footprint_m2: num(structure.read('footprint_m2')),
      floor_area_m2: num(structure.read('floor_area_m2')),
      floors: num(structure.read('floors')),
      structure_text: text(structure.read('structure_text')),
      completed_year: num(structure.read('completed_year')),
      ownership_term: text(structure.read('ownership_term')),
    });
    if (row.success) collected.steps.push({ table: 'structures', row: { id: id(`structures[${i}]`), ...scope, ...row.data } });
    else collected.invalid.push(...issuePaths(structure.prefix, row.error));
  }

  if (address !== null) {
    collected.steps.push({ table: 'properties', row: { id: extraction.propertyId, household_id: extraction.householdId, certificate_address_text: address } });
  }
  return finish(collected, decided);
}

const normalizeCode = (code: string) => code.replace(/\s+/gu, '').toUpperCase();

/**
 * A bill writes one utility account on the document's property, keyed by the extraction. An account of the same kind
 * and customer code already on the property is the same account: it is reused, never rewritten.
 */
export function planUtilityBillAcceptance(extraction: AcceptanceExtraction, decisions: Decisions, { accounts }: Pick<PlanContext, 'accounts'>): PlanResult {
  const decided = decide('utility_bill_v1', extraction.result, decisions);
  const root = itemOf(decided.values, '');
  const collected: Collected = { steps: [], missing: [], invalid: [...decided.invalid] };
  const account = utilityAccountSchema.safeParse({
    unit_id: null,
    kind: root.read('kind'),
    provider: text(root.read('provider')),
    customer_code: text(root.read('customer_code')),
    holder_name: text(root.read('holder_name')),
    note: null,
  });
  const code = text(root.read('customer_code'));
  const known = accounts.some(
    (existing) =>
      existing.propertyId === extraction.propertyId &&
      existing.kind === root.read('kind') &&
      code !== null &&
      existing.customerCode !== null &&
      normalizeCode(existing.customerCode) === normalizeCode(code),
  );
  if (root.read('kind') === null) collected.missing.push('kind');
  else if (known) {
    // Accepting the bill confirms the account Mẹ already has; nothing new is written.
  } else if (account.success) {
    collected.steps.push({
      table: 'utility_accounts',
      row: { id: rowId(extraction.id, 'utility_account'), household_id: extraction.householdId, property_id: extraction.propertyId, ...account.data },
    });
  } else collected.invalid.push(...issuePaths('', account.error));
  return finish(collected, decided);
}

export const PLANNERS = {
  certificate_v1: planCertificateAcceptance,
  utility_bill_v1: planUtilityBillAcceptance,
} as const satisfies Record<SchemaName, (extraction: AcceptanceExtraction, decisions: Decisions, context: PlanContext) => PlanResult>;
