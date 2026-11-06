import { reduceNationalIds } from '@esta/core/agent-schemas';
import { manualEntryId, PLANNERS, readValues, type Decisions } from '@esta/core/extraction/acceptance';
import { isSchemaName } from '@esta/core/extraction/fields';
import { certificateMismatches, savedAddress, soleProvince, type Saved } from '@esta/core/extraction/review-changes';
import type { Json } from '@esta/db';
import { z } from 'zod';
import { currentProvinces } from './address';
import { dbRefusal, idSchema, optionalIdSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, type OpContext } from './op';

/** The plan's rows are plain data, and the database parses them again when it writes them. */
const asJson = (value: unknown) => value as Json;

const decisionsSchema = z.record(
  z.string().max(80),
  z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('accepted') }), z.strictObject({ kind: z.literal('edited'), value: z.string().max(2000) })]),
);
const acceptInputSchema = z.strictObject({ extraction_id: idSchema, decisions: decisionsSchema, property_id: optionalIdSchema.default(null), confirmed: z.boolean().default(false) });
type AcceptInput = z.output<typeof acceptInputSchema>;

/** What a plan can hold back: a value that does not read (`invalid`, `out_of_range`, `missing`, `unidentified`), a full ID, or a certificate that looks like another property's. */
export type ReviewHold = 'invalid' | 'out_of_range' | 'missing' | 'unidentified' | 'national_id' | 'mismatch';
export type ExtractionRefusal =
  | { readonly kind: 'review'; readonly reason: ReviewHold; readonly paths: readonly string[] }
  | { readonly kind: 'not_reviewable' }
  | { readonly kind: 'no_property' };
export type ExtractionAccepted = { readonly property_id: string; readonly document_id: string };

const SENTINELS: Readonly<Record<string, ExtractionRefusal | CommonRefusal>> = {
  ESTA_EXTRACTION_NOT_FOUND: { kind: 'not_reviewable' },
  ESTA_EXTRACTION_NOT_REVIEWABLE: { kind: 'not_reviewable' },
  ESTA_NO_PROPERTY: { kind: 'no_property' },
  ESTA_PROPERTY_NOT_FOUND: { kind: 'no_property' },
  ESTA_FORBIDDEN: { kind: 'forbidden' },
  ESTA_EXTRACTION_STEP: { kind: 'failed' },
};

/** `accept_extraction`'s arguments: the plan's writes and the fields they came from, ready for one call. */
type Acceptance = {
  readonly extractionId: string;
  readonly manualId: string | null;
  readonly propertyId: string | null;
  readonly steps: Json;
  readonly acceptedFields: Json;
  readonly ocrText: string | null;
};

type Target = { readonly id: string; readonly documentId: string; readonly schemaName: string; readonly result: unknown; readonly manualOf: string | null };

/** The extraction a save writes: a waiting or accepted read, or for a failed read the manual entry that replaces it. */
async function reviewTarget(ctx: OpContext, extractionId: string): Promise<Target | null> {
  const { data, error } = await ctx.db
    .from('document_extractions')
    .select('id, document_id, schema_name, status, result')
    .eq('household_id', ctx.householdId)
    .eq('id', extractionId)
    .maybeSingle();
  if (error) throw new Error(`Reading the extraction failed: ${error.message}`);
  if (data === null) return null;
  const base = { documentId: data.document_id, schemaName: data.schema_name };
  if (data.status === 'needs_review' || data.status === 'accepted') return { ...base, id: data.id, result: data.result, manualOf: null };
  if (data.status === 'failed') return { ...base, id: manualEntryId(data.id), result: null, manualOf: data.id };
  return null;
}

type ReviewedDocument = { readonly propertyId: string; readonly sensitive: boolean };

async function reviewedDocument(ctx: OpContext, target: Target, chosen: string | null): Promise<ReviewedDocument | null> {
  const { data, error } = await ctx.db
    .from('documents')
    .select('property_id, sensitivity')
    .eq('household_id', ctx.householdId)
    .eq('id', target.documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Reading the document failed: ${error.message}`);
  if (data === null) return null;
  const propertyId = data.property_id ?? chosen;
  return propertyId === null ? null : { propertyId, sensitive: data.sensitivity !== 'normal' };
}

const currentProvinceSchema = z.object({ province_code: z.string() });

async function mismatchedPaths(ctx: OpContext, propertyId: string, saved: Saved): Promise<readonly string[]> {
  const [property, shares] = await Promise.all([
    ctx.db.from('properties').select('current_address').eq('household_id', ctx.householdId).eq('id', propertyId).maybeSingle(),
    ctx.db.from('ownership_shares').select('parties(full_name)').eq('household_id', ctx.householdId).eq('property_id', propertyId),
  ]);
  if (property.error || shares.error) throw new Error('Reading the property failed');
  const address = savedAddress(saved);
  const provinces = address === null ? [] : await currentProvinces(ctx.db, address.value);
  const current = currentProvinceSchema.safeParse(property.data?.current_address);
  const facts = {
    provinceCode: current.success ? current.data.province_code : null,
    owners: shares.data.map(({ parties }) => ({ fullName: parties.full_name })),
  };
  return certificateMismatches(saved, facts, soleProvince(provinces)).flatMap((mismatch) => mismatch.paths);
}

const readTextSchema = z.object({ full_text: z.string() });

/**
 * The printed text a read carries for search (`utility_bill_v1` today, `lease_v1` in P3-19), reduced to the last four
 * digits of any ID. A sensitive document keeps none, so its words never reach the search index.
 */
function searchText(result: unknown, sensitive: boolean): string | null {
  const parsed = readTextSchema.safeParse(result);
  if (sensitive || !parsed.success) return null;
  const text = reduceNationalIds(parsed.data.full_text).trim();
  return text === '' ? null : text;
}

/**
 * DOC-6: accepts the reviewed fields of an extraction. Planning builds the writes with the planner for the schema, has
 * the database judge every value it keeps as read by the extraction CHECK's rule and stops when one holds a full ID (a
 * typed value is kept as typed, SPEC D11), stops a certificate that looks like another property's until Mẹ confirms it
 * (#356), and copies a normal document's read text for search (DOC-3). `accept_extraction` then writes every row, files
 * the document, marks the extraction accepted and closes the Trợ lý item in one transaction (#184). A failed read is
 * saved as a manual entry named by that read. Every row is keyed by the extraction, so accepting again rewrites the same rows.
 */
export const extractionAccept = defineOp<AcceptInput, Acceptance, ExtractionAccepted, ExtractionRefusal>({
  creates: null,
  input: acceptInputSchema,
  async plan(ctx, input) {
    const target = await reviewTarget(ctx, input.extraction_id);
    if (target === null || !isSchemaName(target.schemaName)) return refuse({ kind: 'not_reviewable' });
    const document = await reviewedDocument(ctx, target, input.property_id);
    if (document === null) return refuse({ kind: 'no_property' });
    const [parties, accounts] = await Promise.all([
      ctx.db.from('parties').select('id, full_name, id_last4').eq('household_id', ctx.householdId),
      ctx.db.from('utility_accounts').select('id, property_id, kind, customer_code').eq('household_id', ctx.householdId).eq('property_id', document.propertyId),
    ]);
    if (parties.error || accounts.error) return refuse({ kind: 'failed' });
    const extraction = { id: target.id, householdId: ctx.householdId, propertyId: document.propertyId, documentId: target.documentId, result: target.result };
    const planned = PLANNERS[target.schemaName](extraction, input.decisions as Decisions, {
      parties: parties.data.map((row) => ({ id: row.id, fullName: row.full_name, idLast4: row.id_last4 })),
      accounts: accounts.data.map((row) => ({ id: row.id, propertyId: row.property_id, kind: row.kind, customerCode: row.customer_code })),
    });
    if (!planned.ok) return refuse({ kind: 'review', reason: planned.reason, paths: planned.paths });
    const values = readValues(planned.plan);
    const readText = searchText(target.result, document.sensitive);
    const judged = readText === null ? values.map(({ value }) => value) : [...values.map(({ value }) => value), readText];
    const { data: held, error } = await ctx.db.rpc('national_id_indexes', { p_values: judged });
    if (error) return refuse({ kind: 'failed' });
    const fieldsHeld = held.filter((index) => index < values.length);
    if (fieldsHeld.length > 0) return refuse({ kind: 'review', reason: 'national_id', paths: fieldsHeld.flatMap((index) => values[index]?.path ?? []) });
    if (target.schemaName === 'certificate_v1' && !input.confirmed) {
      const mismatched = await mismatchedPaths(ctx, document.propertyId, planned.plan.acceptedFields).catch(() => null);
      if (mismatched === null) return refuse({ kind: 'failed' });
      if (mismatched.length > 0) return refuse({ kind: 'review', reason: 'mismatch', paths: mismatched });
    }
    return change({
      extractionId: input.extraction_id,
      manualId: target.manualOf === null ? null : target.id,
      propertyId: document.propertyId,
      steps: asJson(planned.plan.steps),
      acceptedFields: asJson(planned.plan.acceptedFields),
      // Mẹ never sees the read text, so the judge refusing it drops the copy rather than the save; ocr_text stays null.
      ocrText: readText !== null && !held.includes(values.length) ? readText : null,
    });
  },
  async apply(ctx, accepting) {
    const { data, error } = await ctx.db.rpc('accept_extraction', {
      p_extraction_id: accepting.extractionId,
      p_steps: accepting.steps,
      p_accepted_fields: accepting.acceptedFields,
      ...(accepting.manualId === null ? {} : { p_manual_id: accepting.manualId }),
      ...(accepting.propertyId === null ? {} : { p_property_id: accepting.propertyId }),
      ...(accepting.ocrText === null ? {} : { p_ocr_text: accepting.ocrText }),
    });
    const [row] = data ?? [];
    return error || row === undefined ? refuse(error ? dbRefusal(error, SENTINELS) : { kind: 'failed' as const }) : { ok: true, value: row };
  },
});

const rejectInputSchema = z.strictObject({ extraction_id: idSchema });
type RejectInput = z.output<typeof rejectInputSchema>;
export type ExtractionRejected = { readonly document_id: string };
export type RejectRefusal = { readonly kind: 'not_reviewable' };

const REJECT_SENTINELS: Readonly<Record<string, RejectRefusal | CommonRefusal>> = {
  ESTA_EXTRACTION_NOT_FOUND: { kind: 'not_reviewable' },
  ESTA_FORBIDDEN: { kind: 'forbidden' },
};

/** `Không dùng`: the read is set aside, nothing is written from it, and the Trợ lý item that pointed at it leaves the new list. */
export const extractionReject = defineOp<RejectInput, RejectInput, ExtractionRejected, RejectRefusal>({
  creates: null,
  input: rejectInputSchema,
  plan: async (_ctx, input) => change(input),
  async apply(ctx, { extraction_id }) {
    const { data, error } = await ctx.db.rpc('reject_extraction', { p_extraction_id: extraction_id });
    if (error) return refuse(dbRefusal(error, REJECT_SENTINELS));
    return data === null ? refuse({ kind: 'not_reviewable' as const }) : { ok: true, value: { document_id: data } };
  },
});
