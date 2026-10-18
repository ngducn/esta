'use server';

import { reduceNationalIds } from '@esta/core/agent-schemas';
import { manualEntryId, plannedValues, PLANNERS, type Decisions, type PlanStep } from '@esta/core/extraction/acceptance';
import { isSchemaName } from '@esta/core/extraction/fields';
import type { Json, TablesInsert } from '@esta/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type ReviewSave =
  | { readonly ok: true; readonly propertyId: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'out_of_range' | 'missing' | 'national_id'; readonly paths: readonly string[] }
  | { readonly ok: false; readonly reason: 'no_property' | 'not_reviewable' | 'forbidden' | 'failed' };

const uuid = z.uuid();
const decisionsSchema = z.record(
  z.string().max(80),
  z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('accepted') }), z.strictObject({ kind: z.literal('edited'), value: z.string().max(2000) })]),
);

type Session = Awaited<ReturnType<typeof createSessionClient>>;

const asJson = (row: unknown) => row as Json;

/** One upsert per step on the member's session; RLS decides, and the same ids make a retry rewrite the same rows. */
async function runStep(supabase: Session, step: PlanStep): Promise<boolean> {
  const write = () => {
    switch (step.table) {
      case 'parties':
        return supabase.from('parties').upsert({ ...step.row, tags: [...step.row.tags] }, { onConflict: 'id' });
      case 'certificates':
        return supabase.from('certificates').upsert({ ...step.row, holder_party_ids: [...step.row.holder_party_ids], annotations: asJson(step.row.annotations) }, { onConflict: 'id' });
      case 'parcels':
        return supabase.from('parcels').upsert({ ...step.row, purposes: asJson(step.row.purposes) }, { onConflict: 'id' });
      case 'structures':
        return supabase.from('structures').upsert(step.row, { onConflict: 'id' });
      case 'utility_accounts':
        return supabase.from('utility_accounts').upsert(step.row, { onConflict: 'id' });
      case 'properties':
        return supabase
          .from('properties')
          .update({ certificate_address_text: step.row.certificate_address_text })
          .eq('household_id', step.row.household_id)
          .eq('id', step.row.id);
    }
  };
  const { error } = await write();
  return error === null;
}

type Target = { readonly id: string; readonly householdId: string; readonly documentId: string; readonly schemaName: string; readonly result: unknown; readonly manualOf: string | null };

/** The extraction a save writes: a waiting or accepted read, or for a failed read the manual entry that replaces it. */
async function reviewTarget(supabase: Session, householdId: string, extractionId: string): Promise<Target | null> {
  const { data, error } = await supabase
    .from('document_extractions')
    .select('id, household_id, document_id, schema_name, status, result')
    .eq('household_id', householdId)
    .eq('id', extractionId)
    .maybeSingle();
  if (error || data === null) return null;
  const base = { householdId: data.household_id, documentId: data.document_id, schemaName: data.schema_name };
  if (data.status === 'needs_review' || data.status === 'accepted') return { ...base, id: data.id, result: data.result, manualOf: null };
  if (data.status === 'failed') return { ...base, id: manualEntryId(data.id), result: null, manualOf: data.id };
  return null;
}

type ReviewedDocument = { readonly propertyId: string; readonly sensitive: boolean };

async function reviewedDocument(supabase: Session, target: Target, chosen: string | null): Promise<ReviewedDocument | null> {
  const { data } = await supabase.from('documents').select('property_id, sensitivity').eq('household_id', target.householdId).eq('id', target.documentId).maybeSingle();
  if (data === null) return null;
  const sensitive = data.sensitivity !== 'normal';
  if (data.property_id !== null) return { propertyId: data.property_id, sensitive };
  if (chosen === null) return null;
  const { error } = await supabase.from('documents').update({ property_id: chosen }).eq('household_id', target.householdId).eq('id', target.documentId);
  return error ? null : { propertyId: chosen, sensitive };
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

/** The Trợ lý item that pointed at this review leaves the new list once the review is done. */
async function closeItems(supabase: Session, householdId: string, keys: readonly string[]) {
  await supabase.from('agent_items').update({ status: 'done' }).eq('household_id', householdId).in('dedupe_key', keys).eq('status', 'new');
}

/**
 * Accepts the reviewed fields of an extraction (DOC-6): builds the plan, has the database judge every value in it by
 * the extraction CHECK's rule and stops before any write when one holds a full ID (SPEC D11), upserts each step on the
 * member's session, copies a normal document's read text into `documents.ocr_text` for search (DOC-3), then marks the
 * extraction accepted with `accepted_fields`. A failed read is saved as a manual
 * entry, inserted accepted with no model before its rows so the certificate can name it. Every step is keyed by the
 * extraction, so a retry after a partial failure converges on the same rows.
 */
export async function saveExtractionReview(extractionId: unknown, decisions: unknown, propertyId: unknown = null): Promise<ReviewSave> {
  const id = uuid.safeParse(extractionId);
  const parsed = decisionsSchema.safeParse(decisions);
  const chosen = propertyId === null ? { success: true as const, data: null } : uuid.safeParse(propertyId);
  if (!id.success || !parsed.success || !chosen.success) return { ok: false, reason: 'not_reviewable' };
  const member = await requireMember();
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const supabase = await createSessionClient();
  const target = await reviewTarget(supabase, member.household.id, id.data);
  if (target === null || !isSchemaName(target.schemaName)) return { ok: false, reason: 'not_reviewable' };
  const document = await reviewedDocument(supabase, target, chosen.data);
  if (document === null) return { ok: false, reason: 'no_property' };
  const property = document.propertyId;

  const [parties, accounts] = await Promise.all([
    supabase.from('parties').select('id, full_name, id_last4').eq('household_id', target.householdId),
    supabase.from('utility_accounts').select('id, property_id, kind, customer_code').eq('household_id', target.householdId).eq('property_id', property),
  ]);
  if (parties.error || accounts.error) return { ok: false, reason: 'failed' };
  const extraction = { id: target.id, householdId: target.householdId, propertyId: property, documentId: target.documentId, result: target.result };
  const planned = PLANNERS[target.schemaName](extraction, parsed.data as Decisions, {
    parties: parties.data.map((row) => ({ id: row.id, fullName: row.full_name, idLast4: row.id_last4 })),
    accounts: accounts.data.map((row) => ({ id: row.id, propertyId: row.property_id, kind: row.kind, customerCode: row.customer_code })),
  });
  if (!planned.ok) return planned;
  const values = plannedValues(planned.plan);
  const readText = searchText(target.result, document.sensitive);
  const judged = readText === null ? values.map(({ value }) => value) : [...values.map(({ value }) => value), readText];
  const { data: held, error: judgeError } = await supabase.rpc('national_id_indexes', { p_values: judged });
  if (judgeError) return { ok: false, reason: 'failed' };
  // Mẹ never sees the read text, so the judge refusing it drops the copy rather than the save; ocr_text stays null.
  const fieldsHeld = held.filter((index) => index < values.length);
  const ocrText = readText !== null && !held.includes(values.length) ? readText : null;
  if (fieldsHeld.length > 0) return { ok: false, reason: 'national_id', paths: [...new Set(fieldsHeld.flatMap((index) => values[index]?.path ?? []))] };
  const acceptedFields = asJson(planned.plan.acceptedFields);

  if (target.manualOf !== null) {
    const manual: TablesInsert<'document_extractions'> = {
      id: target.id,
      household_id: target.householdId,
      document_id: target.documentId,
      schema_name: target.schemaName,
      schema_version: 1,
      status: 'accepted',
      accepted_fields: acceptedFields,
    };
    const { error } = await supabase.from('document_extractions').upsert(manual, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return { ok: false, reason: 'failed' };
  }
  for (const step of planned.plan.steps) {
    if (!(await runStep(supabase, step))) return { ok: false, reason: 'failed' };
  }
  if (ocrText !== null) {
    const { error } = await supabase.from('documents').update({ ocr_text: ocrText }).eq('household_id', target.householdId).eq('id', target.documentId);
    if (error) return { ok: false, reason: 'failed' };
  }
  const { data: accepted, error } = await supabase
    .from('document_extractions')
    .update({ status: 'accepted', accepted_fields: acceptedFields })
    .eq('household_id', target.householdId)
    .eq('id', target.id)
    .in('status', ['needs_review', 'accepted'])
    .select('id');
  if (error || accepted.length !== 1) return { ok: false, reason: 'failed' };

  await closeItems(supabase, target.householdId, [`extract_review:${id.data}`, `extract_failed:${id.data}`]);
  revalidatePath(`/properties/${property}`, 'layout');
  revalidatePath(`/documents/${target.documentId}/review`);
  revalidatePath('/documents');
  return { ok: true, propertyId: property };
}

/** `Không dùng`: the read is set aside and nothing is written from it. */
export async function rejectExtraction(extractionId: unknown): Promise<boolean> {
  const id = uuid.safeParse(extractionId);
  if (!id.success) return false;
  const member = await requireMember();
  if (member.role === 'viewer') return false;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('document_extractions')
    .update({ status: 'rejected' })
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .eq('status', 'needs_review')
    .select('document_id');
  const [row] = data ?? [];
  if (error || row === undefined) return false;
  await closeItems(supabase, member.household.id, [`extract_review:${id.data}`]);
  revalidatePath(`/documents/${row.document_id}/review`);
  return true;
}
