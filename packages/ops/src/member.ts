import type { Db } from './db';

/**
 * The membership Esta opens for a user: the first one they joined. The web's session, the connector's operator check
 * and anything else that acts for a signed-in user agree on it by reading it here.
 */
export async function readMembership(db: Db, userId: string) {
  const { data, error } = await db
    .from('household_members')
    .select('id, role, is_operator, display_name, locale, text_scale, density, household:households!inner(id, name, locale)')
    .eq('user_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the member failed: ${error.message}`);
  return data;
}
