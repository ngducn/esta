import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { createSessionClient } from '@/server/supabase/server';

export type NewItem = { readonly id: string; readonly title: string; readonly createdAt: Instant };

/** The household's unread assistant items, newest first. RLS keeps operator items to operators (FND-2). */
export async function listNewItems(householdId: string): Promise<NewItem[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, created_at')
    .eq('household_id', householdId)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(20);
  if (error) throw new Error(`Reading the assistant items failed: ${error.message}`);
  return data.map((row) => ({ id: row.id, title: row.title, createdAt: parseInstant(row.created_at) }));
}
