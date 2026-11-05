import 'server-only';
import type { Database } from '@esta/db';
import { topicLabels } from '@/server/agent/research';
import { createSessionClient } from '@/server/supabase/server';

export type HouseholdMember = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: Database['public']['Enums']['member_role'];
  readonly signedIn: boolean;
  readonly isOperator: boolean;
};

export async function loadMembers(householdId: string): Promise<readonly HouseholdMember[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('household_members')
    .select('id, invited_email, display_name, role, user_id, is_operator, created_at')
    .eq('household_id', householdId)
    .order('created_at')
    .order('id');
  if (error) throw new Error(`Reading the members failed: ${error.message}`);
  const rank = { admin: 0, member: 1, viewer: 2 } as const;
  return data
    .map((row) => ({ id: row.id, email: row.invited_email, displayName: row.display_name, role: row.role, signedIn: row.user_id !== null, isOperator: row.is_operator }))
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

export async function loadResearchTopics(householdId: string): Promise<readonly string[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('research_topics').select('topic_key, label').eq('household_id', householdId).eq('active', true).order('label');
  if (error) throw new Error(`Reading the research topics failed: ${error.message}`);
  return topicLabels(data);
}
