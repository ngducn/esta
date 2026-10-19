import 'server-only';
import { DOCUMENT_CATEGORY_IDS } from '@esta/core/documents';
import { LEASE_AMENDMENT_COLUMNS, leaseAmendmentRowSchema, type LeaseAmendmentRow } from '@esta/core/schemas/lease';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type LeaseDocument = { readonly id: string; readonly title: string; readonly category: (typeof DOCUMENT_CATEGORY_IDS)[number] };

export type LeaseDetailExtras = {
  readonly amendments: readonly LeaseAmendmentRow[];
  readonly documents: readonly LeaseDocument[];
};

const documentRowSchema = z.object({ id: z.uuid(), title: z.string(), category: z.enum(DOCUMENT_CATEGORY_IDS) });

/** The lease's amendments in effective order and the documents filed under it. RLS scopes both to the member. */
export const loadLeaseDetailExtras = cache(async (leaseId: string): Promise<LeaseDetailExtras> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, lease_id: leaseId };
  const [amendments, documents] = await Promise.all([
    supabase.from('lease_amendments').select(LEASE_AMENDMENT_COLUMNS).match(scope).order('effective_period_start'),
    supabase.from('documents').select('id, title, category').match(scope).is('deleted_at', null).order('created_at', { ascending: false }).order('id'),
  ]);
  if (amendments.error) throw new Error(`Reading lease amendments failed: ${amendments.error.message}`);
  if (documents.error) throw new Error(`Reading lease documents failed: ${documents.error.message}`);
  return {
    amendments: z.array(leaseAmendmentRowSchema).parse(amendments.data),
    documents: z.array(documentRowSchema).parse(documents.data),
  };
});
