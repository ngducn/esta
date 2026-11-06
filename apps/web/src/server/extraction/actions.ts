'use server';

import { extractionAccept, extractionReject, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type ReviewSave =
  | { readonly ok: true; readonly propertyId: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'out_of_range' | 'missing' | 'unidentified' | 'national_id' | 'mismatch'; readonly paths: readonly string[] }
  | { readonly ok: false; readonly reason: 'no_property' | 'not_reviewable' | 'forbidden' | 'failed' };

/** Accepts the reviewed fields of an extraction (DOC-6) through `extractionAccept`, which writes everything or nothing. */
export async function saveExtractionReview(extractionId: unknown, decisions: unknown, propertyId: unknown = null, confirmed: unknown = false): Promise<ReviewSave> {
  const result = await runOp(extractionAccept, await webOpContext(), { extraction_id: extractionId, decisions, property_id: propertyId, confirmed: confirmed === true });
  if (!result.ok) {
    const { reason } = result;
    switch (reason.kind) {
      case 'review':
        return { ok: false, reason: reason.reason, paths: reason.paths };
      case 'not_reviewable':
      case 'no_property':
      case 'forbidden':
        return { ok: false, reason: reason.kind };
      case 'invalid':
      case 'not_found':
        return { ok: false, reason: 'not_reviewable' };
      default:
        return { ok: false, reason: 'failed' };
    }
  }
  const { property_id, document_id } = result.value;
  revalidatePath(`/properties/${property_id}`, 'layout');
  revalidatePath(`/documents/${document_id}/review`);
  revalidatePath('/documents');
  return { ok: true, propertyId: property_id };
}

/** `Không dùng`: the read is set aside and nothing is written from it. */
export async function rejectExtraction(extractionId: unknown): Promise<boolean> {
  const result = await runOp(extractionReject, await webOpContext(), { extraction_id: extractionId });
  if (!result.ok) return false;
  revalidatePath(`/documents/${result.value.document_id}/review`);
  return true;
}
