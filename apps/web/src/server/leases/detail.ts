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
