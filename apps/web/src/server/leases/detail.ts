import 'server-only';
import { DOCUMENT_CATEGORY_IDS } from '@esta/core/documents';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type LeaseDocument = { readonly id: string; readonly title: string; readonly category: (typeof DOCUMENT_CATEGORY_IDS)[number] };

const documentRowSchema = z.object({ id: z.uuid(), title: z.string(), category: z.enum(DOCUMENT_CATEGORY_IDS) });

/** The documents filed under the lease, newest first. RLS scopes them to the member. */
export const loadLeaseDocuments = cache(async (leaseId: string): Promise<LeaseDocument[]> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, category')
    .match({ household_id: member.household.id, lease_id: leaseId })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id');
  if (error) throw new Error(`Reading lease documents failed: ${error.message}`);
  return z.array(documentRowSchema).parse(data);
});

/**
 * What Mẹ accepted from a scanned lease contract on this property that no lease holds yet (P3-19), as
 * `document_extractions.accepted_fields`; null when there is no such contract or no accepted reading of it.
 */
export async function loadContractReading(propertyId: string, documentId: string): Promise<unknown> {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data: document, error } = await supabase
    .from('documents')
    .select('id')
    .match({ household_id: member.household.id, id: documentId, property_id: propertyId, category: 'lease_contract' })
    .is('lease_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Reading the lease contract failed: ${error.message}`);
  if (document === null) return null;
  const { data: reading, error: readingError } = await supabase
    .from('document_extractions')
    .select('accepted_fields')
    .match({ household_id: member.household.id, document_id: documentId, schema_name: 'lease_v1', status: 'accepted' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readingError) throw new Error(`Reading the accepted contract failed: ${readingError.message}`);
  return reading?.accepted_fields ?? null;
}
