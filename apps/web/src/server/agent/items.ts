import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { retryHint, type RetryHint } from './retry-hint';

export type NewItem = { readonly id: string; readonly title: string; readonly createdAt: Instant; readonly retry: RetryHint | null };

/** The household's unread assistant items, newest first. RLS keeps operator items to operators (FND-2). */
export async function listNewItems({ household, role }: Pick<Member, 'household' | 'role'>): Promise<NewItem[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, created_at, proposal')
    .eq('household_id', household.id)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(20);
  if (error) throw new Error(`Reading the assistant items failed: ${error.message}`);
  return data.map((row) => ({ id: row.id, title: row.title, createdAt: parseInstant(row.created_at), retry: retryHint(row.proposal, role) }));
}
