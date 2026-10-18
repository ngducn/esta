'use server';

import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { DOCUMENT_LIST_COLUMNS, toListItems, vaultTiles, type VaultTile } from './list';

/** [app rule] The best matches only: a short query in a large vault would otherwise sign a thumbnail per document. */
const SEARCH_LIMIT = 50;

const querySchema = z.string().trim().min(1).max(200);
const scopeSchema = z.uuid().nullable();

export type VaultSearch = { readonly ok: true; readonly tiles: readonly VaultTile[]; readonly capped: boolean } | { readonly ok: false };

/**
 * Ranks the household's documents for `query` through `search_documents` on the member's session, so RLS keeps every
 * row inside the household (DOC-3). `propertyId` narrows it to one property's tab.
 */
export async function searchDocuments(query: unknown, propertyId: unknown = null): Promise<VaultSearch> {
  const parsed = querySchema.safeParse(query);
  const scope = scopeSchema.safeParse(propertyId);
  if (!parsed.success || !scope.success) return { ok: false };
  const member = await requireMember();
  const supabase = await createSessionClient();
  let request = supabase.rpc('search_documents', { p_query: parsed.data }).select(DOCUMENT_LIST_COLUMNS).eq('household_id', member.household.id);
  if (scope.data !== null) request = request.eq('property_id', scope.data);
  const { data, error } = await request.limit(SEARCH_LIMIT);
  if (error) return { ok: false };
  const [items, clock] = await Promise.all([toListItems(member.household.id, data), readRequestClock()]);
  return { ok: true, tiles: await vaultTiles(items, clock.today()), capped: data.length === SEARCH_LIMIT };
}
